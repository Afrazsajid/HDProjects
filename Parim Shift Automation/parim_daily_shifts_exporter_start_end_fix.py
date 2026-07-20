from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import requests
from dotenv import load_dotenv
from selenium import webdriver
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    SessionNotCreatedException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

LOGIN_URL = "https://hd.parim.co/login"
SHIFTS_LIST_URL = "https://hd.parim.co/schedule/shifts-list"

# PARiM export checkbox IDs in the exact order they must be selected.
# A tuple is used rather than a set because React can lose rapid, unordered
# checkbox updates when the export dialog re-renders.
EXPORT_COLUMN_IDS = (
    "choose-column-timeFrom",    # Start time
    "choose-column-timeTo",      # End time
    "choose-column-staff",       # Person
    "choose-column-_userPhone",  # Phone
    "choose-column-position",    # Position
    "choose-column-venue",       # Location
)

EXPORT_COLUMN_LABELS = {
    "choose-column-timeFrom": "Start time",
    "choose-column-timeTo": "End time",
    "choose-column-staff": "Person",
    "choose-column-_userPhone": "Phone",
    "choose-column-position": "Position",
    "choose-column-venue": "Location",
}

PERIOD_LABELS = {
    "From today",
    "Today",
    "Current week",
    "Last week",
    "Next week",
    "Current month",
    "Last month",
    "Next month",
    "Current year",
    "Last year",
    "Next year",
}

REQUIRED_CSV_COLUMNS = ("Start time", "End time", "Person", "Phone", "Position")
OPTIONAL_CSV_COLUMNS = ("Location",)
LOGGER = logging.getLogger("parim_daily_shifts")


class AutomationError(RuntimeError):
    """Raised when a required automation step cannot be completed."""


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class AppConfig:
    parim_email: str
    parim_password: str
    sheet_url: str
    api_token: str
    download_dir: Path
    headless: bool
    timeout_seconds: int
    keep_downloaded_csv: bool
    chrome_user_data_dir: str
    chrome_profile_directory: str

    @classmethod
    def from_env(cls, *, require_browser: bool, require_upload: bool) -> "AppConfig":
        load_dotenv()

        config = cls(
            parim_email=os.getenv("PARIM_EMAIL", "").strip(),
            parim_password=os.getenv("PARIM_PASSWORD", "").strip(),
            sheet_url=os.getenv("PARIM_SHEET_URL", "").strip(),
            api_token=os.getenv("PARIM_API_TOKEN", "").strip(),
            download_dir=Path(os.getenv("DOWNLOAD_DIR", "downloads")).expanduser().resolve(),
            headless=env_bool("PARIM_HEADLESS", False),
            timeout_seconds=max(15, int(os.getenv("SELENIUM_TIMEOUT", "45"))),
            keep_downloaded_csv=env_bool("KEEP_DOWNLOADED_CSV", True),
            chrome_user_data_dir=os.getenv("CHROME_USER_DATA_DIR", "").strip(),
            chrome_profile_directory=os.getenv("CHROME_PROFILE_DIRECTORY", "").strip(),
        )

        missing: list[str] = []
        if require_browser:
            if not config.parim_email:
                missing.append("PARIM_EMAIL")
            if not config.parim_password:
                missing.append("PARIM_PASSWORD")
        if require_upload:
            if not config.sheet_url:
                missing.append("PARIM_SHEET_URL")
            if not config.api_token:
                missing.append("PARIM_API_TOKEN")

        if missing:
            raise AutomationError(
                "Missing required .env values: " + ", ".join(missing)
            )

        config.download_dir.mkdir(parents=True, exist_ok=True)
        return config


def configure_logging() -> None:
    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"parim_daily_shifts_{datetime.now():%Y-%m-%d}.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file, encoding="utf-8"),
        ],
    )


def _chrome_options(
    config: AppConfig,
    *,
    user_data_dir: Path,
    force_headless: bool = False,
    use_configured_profile: bool = False,
) -> webdriver.ChromeOptions:
    options = webdriver.ChromeOptions()

    # A separate profile prevents Chrome profile locks and DevToolsActivePort
    # startup crashes. ChromeDriver also recommends using a non-default profile.
    options.add_argument(f"--user-data-dir={user_data_dir}")

    if use_configured_profile and config.chrome_profile_directory:
        options.add_argument(
            f"--profile-directory={config.chrome_profile_directory}"
        )

    headless = config.headless or force_headless
    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
    else:
        options.add_argument("--start-maximized")

    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--remote-allow-origins=*")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-gpu")

    prefs = {
        "download.default_directory": str(config.download_dir),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
        "profile.default_content_setting_values.automatic_downloads": 1,
    }
    options.add_experimental_option("prefs", prefs)
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    return options


def _start_chrome(
    config: AppConfig,
    *,
    user_data_dir: Path,
    force_headless: bool = False,
    use_configured_profile: bool = False,
) -> webdriver.Chrome:
    options = _chrome_options(
        config,
        user_data_dir=user_data_dir,
        force_headless=force_headless,
        use_configured_profile=use_configured_profile,
    )

    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    service = Service(
        log_output=str((log_dir / "chromedriver.log").resolve()),
        service_args=["--verbose"],
    )

    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(config.timeout_seconds + 30)

    try:
        driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": str(config.download_dir)},
        )
    except Exception:
        LOGGER.debug(
            "Chrome did not accept Page.setDownloadBehavior", exc_info=True
        )

    return driver


def build_driver(config: AppConfig) -> webdriver.Chrome:
    temporary_profiles: list[Path] = []

    def fresh_profile() -> Path:
        profile = Path(
            tempfile.mkdtemp(prefix="parim_chrome_", dir=str(Path.cwd()))
        ).resolve()
        temporary_profiles.append(profile)
        return profile

    configured_profile: Path | None = None
    if config.chrome_user_data_dir:
        configured_profile = Path(
            config.chrome_user_data_dir
        ).expanduser().resolve()
        configured_profile.mkdir(parents=True, exist_ok=True)

    attempts: list[tuple[str, Path, bool, bool]] = []
    if configured_profile is not None:
        attempts.append(
            (
                "configured Chrome profile",
                configured_profile,
                False,
                True,
            )
        )

    attempts.append(("fresh isolated Chrome profile", fresh_profile(), False, False))

    # A final headless retry helps on Windows machines where a visible Chrome
    # window is blocked by policy, stale desktop state, or graphics startup.
    if not config.headless:
        attempts.append(("fresh headless Chrome profile", fresh_profile(), True, False))

    last_error: SessionNotCreatedException | None = None

    for label, profile, force_headless, use_configured_profile in attempts:
        try:
            LOGGER.info("Starting Chrome with %s", label)
            driver = _start_chrome(
                config,
                user_data_dir=profile,
                force_headless=force_headless,
                use_configured_profile=use_configured_profile,
            )

            # Keep only the successful temporary profile for cleanup in main().
            for temp_profile in temporary_profiles:
                if temp_profile != profile:
                    shutil.rmtree(temp_profile, ignore_errors=True)
            if profile in temporary_profiles:
                setattr(driver, "_parim_temp_profile_dir", str(profile))

            return driver
        except SessionNotCreatedException as exc:
            last_error = exc
            LOGGER.warning(
                "Chrome failed with %s. Retrying with another profile/mode.",
                label,
            )
            if profile in temporary_profiles:
                shutil.rmtree(profile, ignore_errors=True)

    for temp_profile in temporary_profiles:
        shutil.rmtree(temp_profile, ignore_errors=True)

    detail = str(last_error) if last_error else "Unknown Chrome startup error"
    raise AutomationError(
        "Chrome could not start after multiple attempts. Close every Chrome "
        "window and end chrome.exe/chromedriver.exe in Task Manager, leave "
        "CHROME_USER_DATA_DIR and CHROME_PROFILE_DIRECTORY blank in .env, "
        "then upgrade Selenium with: python -m pip install -U selenium. "
        "Driver details are saved in logs/chromedriver.log. Original error: "
        + detail
    )


def safe_click(driver: webdriver.Chrome, element: WebElement) -> None:
    """Click an element, falling back to a JavaScript click when needed."""
    try:
        driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center', inline: 'center'});",
            element,
        )
        element.click()
    except (ElementClickInterceptedException, StaleElementReferenceException):
        driver.execute_script("arguments[0].click();", element)


def login(driver: webdriver.Chrome, config: AppConfig) -> None:
    LOGGER.info("Opening PARiM login page")
    driver.get(LOGIN_URL)
    wait = WebDriverWait(driver, config.timeout_seconds)

    # A dedicated Chrome profile may already have an authenticated session.
    if "/login" not in driver.current_url:
        LOGGER.info("Existing PARiM session detected")
        return

    wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, 'form[data-testid="sign-in-form"]')
        )
    )
    email_input = wait.until(
        EC.visibility_of_element_located(
            (By.CSS_SELECTOR, 'input[data-testid="email-test"][name="email"]')
        )
    )
    password_input = wait.until(
        EC.visibility_of_element_located(
            (By.CSS_SELECTOR, 'input[data-testid="password"][name="password"]')
        )
    )

    email_input.clear()
    email_input.send_keys(config.parim_email)
    password_input.clear()
    password_input.send_keys(config.parim_password)

    submit_button = wait.until(
        EC.element_to_be_clickable(
            (By.CSS_SELECTOR, 'button[data-testid="submit-button"][type="submit"]')
        )
    )
    safe_click(driver, submit_button)

    try:
        wait.until(lambda current_driver: "/login" not in current_driver.current_url)
    except TimeoutException as exc:
        errors = [
            item.text.strip()
            for item in driver.find_elements(By.CSS_SELECTOR, '[role="alert"]')
            if item.is_displayed() and item.text.strip()
        ]
        detail = "; ".join(errors) if errors else "Login did not leave the login page."
        raise AutomationError(f"PARiM login failed: {detail}") from exc

    LOGGER.info("PARiM login completed")


def _current_context_has_shifts_list(driver: webdriver.Chrome) -> bool:
    """Return True when the Shifts List header exists in the active DOM context.

    PARiM is a React application and, depending on the account/session, its page
    can briefly render inside a frame or report an element as not visible while
    it is already drawn on screen. We therefore check for DOM presence and text
    instead of relying only on Selenium's visibility calculation.
    """
    try:
        headers = driver.find_elements(By.CSS_SELECTOR, "h1.PageHeader")
        for header in headers:
            try:
                if " ".join(header.text.split()).casefold() == "shifts list":
                    return True
            except StaleElementReferenceException:
                continue

        # Fallback for cases where WebElement.text is temporarily empty even
        # though React has inserted the textContent into the page.
        return bool(
            driver.execute_script(
                """
                return Array.from(document.querySelectorAll('h1.PageHeader'))
                    .some(el => (el.textContent || '').trim().toLowerCase() === 'shifts list');
                """
            )
        )
    except Exception:
        return False


def _switch_to_context_containing_shifts_list(
    driver: webdriver.Chrome,
    *,
    max_frame_depth: int = 5,
) -> bool:
    """Search the current document and nested frames for the Shifts List page.

    When found, the driver is intentionally left inside the matching frame so
    all following selectors operate on the visible PARiM interface.
    """

    def search_frames(depth: int) -> bool:
        if _current_context_has_shifts_list(driver):
            return True
        if depth >= max_frame_depth:
            return False

        frames = driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
        for index in range(len(frames)):
            try:
                # Re-read the frame list because React can replace frame nodes.
                current_frames = driver.find_elements(By.CSS_SELECTOR, "iframe, frame")
                if index >= len(current_frames):
                    break
                driver.switch_to.frame(current_frames[index])
                if search_frames(depth + 1):
                    return True
                driver.switch_to.parent_frame()
            except Exception:
                try:
                    driver.switch_to.parent_frame()
                except Exception:
                    driver.switch_to.default_content()
        return False

    original_handle = driver.current_window_handle
    handles = list(driver.window_handles)
    if original_handle in handles:
        handles.remove(original_handle)
        handles.insert(0, original_handle)

    for handle in handles:
        try:
            driver.switch_to.window(handle)
            driver.switch_to.default_content()
            if search_frames(0):
                return True
        except Exception:
            continue

    try:
        driver.switch_to.window(original_handle)
        driver.switch_to.default_content()
    except Exception:
        pass
    return False


def _save_shifts_list_diagnostics(driver: webdriver.Chrome) -> tuple[str, str]:
    """Save HTML and screenshot to help diagnose future PARiM layout changes."""
    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    html_path = (log_dir / f"shifts_list_timeout_{stamp}.html").resolve()
    screenshot_path = (log_dir / f"shifts_list_timeout_{stamp}.png").resolve()

    try:
        html_path.write_text(driver.page_source, encoding="utf-8")
    except Exception:
        html_path = Path("")

    try:
        driver.save_screenshot(str(screenshot_path))
    except Exception:
        screenshot_path = Path("")

    return str(html_path) if html_path else "", str(screenshot_path) if screenshot_path else ""


def open_shifts_list(driver: webdriver.Chrome, timeout_seconds: int) -> None:
    LOGGER.info("Opening Shifts List")
    driver.get(SHIFTS_LIST_URL)

    # Wait for the initial navigation to settle. Do not require complete because
    # some PARiM background requests can keep the page busy after the UI appears.
    try:
        WebDriverWait(driver, min(timeout_seconds, 20)).until(
            lambda current_driver: current_driver.execute_script(
                "return document.readyState"
            ) in {"interactive", "complete"}
        )
    except TimeoutException:
        LOGGER.warning("The document ready state did not settle, continuing with DOM checks")

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if "/login" in driver.current_url:
            raise AutomationError("PARiM returned to the login page.")

        if _switch_to_context_containing_shifts_list(driver):
            LOGGER.info("Shifts List filter bar detected")
            return

        time.sleep(0.5)

    current_url = driver.current_url
    title = driver.title
    html_path, screenshot_path = _save_shifts_list_diagnostics(driver)
    diagnostic_parts = [f"URL: {current_url}", f"title: {title!r}"]
    if html_path:
        diagnostic_parts.append(f"HTML: {html_path}")
    if screenshot_path:
        diagnostic_parts.append(f"Screenshot: {screenshot_path}")

    raise AutomationError(
        "The Shifts List page was visible but Selenium could not locate its "
        "header in the active document context. " + "; ".join(diagnostic_parts)
    )


def find_period_button(driver: webdriver.Chrome) -> WebElement:
    candidates = driver.find_elements(
        By.CSS_SELECTOR,
        ".filterbar-inner .select-dropdown-field[role='button']",
    )
    for candidate in candidates:
        try:
            text = " ".join(candidate.text.split())
            if candidate.is_displayed() and text in PERIOD_LABELS:
                return candidate
        except StaleElementReferenceException:
            continue
    raise AutomationError("Could not identify the date-period dropdown.")


def select_today(driver: webdriver.Chrome, timeout_seconds: int) -> str:
    LOGGER.info("Selecting Today")
    wait = WebDriverWait(driver, timeout_seconds)

    def period_button_ready(current_driver: webdriver.Chrome) -> WebElement | bool:
        try:
            return find_period_button(current_driver)
        except AutomationError:
            return False

    period_button = wait.until(period_button_ready)
    safe_click(driver, period_button)

    today_option = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//div[contains(@class,'ReactVirtualized__Grid__innerScrollContainer')]"
                "//div[contains(@class,'filter-item-inner') and normalize-space()='Today']",
            )
        )
    )
    safe_click(driver, today_option)

    wait.until(
        EC.visibility_of_element_located(
            (
                By.XPATH,
                "//header[contains(@class,'TheLayout__header')]"
                "//h1[contains(@class,'ListTable__view-title')]"
                "//em[normalize-space()='Today']",
            )
        )
    )

    # The header contains em elements for Today, from date and to date.
    header_values = [
        " ".join(element.text.split())
        for element in driver.find_elements(
            By.CSS_SELECTOR, "header.TheLayout__header h1.ListTable__view-title em"
        )
    ]
    date_text = next(
        (value for value in header_values if re.fullmatch(r"\d{2}/\d{2}/\d{4}", value)),
        "",
    )
    if not date_text:
        raise AutomationError("Could not read today's date from the Shifts List header.")

    return datetime.strptime(date_text, "%d/%m/%Y").date().isoformat()


def export_checkbox_state(
    driver: webdriver.Chrome,
    checkbox_id: str,
) -> tuple[bool, bool]:
    """Return the live input state and PARiM's visible React checked state."""
    checkbox = driver.find_element(By.ID, checkbox_id)
    label = driver.find_element(By.CSS_SELECTOR, f'label[for="{checkbox_id}"]')
    try:
        wrapper = label.find_element(By.CSS_SELECTOR, ".parim-checkbox-wrapper")
        wrapper_classes = set((wrapper.get_attribute("class") or "").split())
    except Exception:
        wrapper_classes = set()

    input_checked = bool(
        driver.execute_script("return Boolean(arguments[0].checked);", checkbox)
    )
    label_classes = set((label.get_attribute("class") or "").split())
    visual_checked = "checked" in label_classes or "checked" in wrapper_classes
    return input_checked, visual_checked


def export_checkbox_is_checked(
    driver: webdriver.Chrome,
    checkbox_id: str,
) -> bool:
    """Treat a checkbox as active if either its input or visible UI is checked."""
    input_checked, visual_checked = export_checkbox_state(driver, checkbox_id)
    return input_checked or visual_checked


def export_checkbox_matches_state(
    driver: webdriver.Chrome,
    checkbox_id: str,
    should_be_checked: bool,
) -> bool:
    """Require the input property and visible React classes to agree."""
    input_checked, visual_checked = export_checkbox_state(driver, checkbox_id)
    if should_be_checked:
        return input_checked and visual_checked
    return not input_checked and not visual_checked


def export_checkbox_debug_state(
    driver: webdriver.Chrome,
    checkbox_id: str,
) -> str:
    """Create a compact state description for useful error logging."""
    try:
        checkbox = driver.find_element(By.ID, checkbox_id)
        label = driver.find_element(By.CSS_SELECTOR, f'label[for="{checkbox_id}"]')
        wrapper = label.find_element(By.CSS_SELECTOR, ".parim-checkbox-wrapper")
        checked = driver.execute_script(
            "return Boolean(arguments[0].checked);", checkbox
        )
        return (
            f"checked={checked}, "
            f"label_class={label.get_attribute('class')!r}, "
            f"wrapper_class={wrapper.get_attribute('class')!r}"
        )
    except Exception as exc:
        return f"state unavailable: {type(exc).__name__}: {exc}"


def wait_for_export_checkbox_state(
    driver: webdriver.Chrome,
    checkbox_id: str,
    should_be_checked: bool,
    timeout_seconds: float = 2.5,
) -> bool:
    """Wait briefly for PARiM's React state and the DOM property to synchronise."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            if export_checkbox_matches_state(driver, checkbox_id, should_be_checked):
                return True
        except (StaleElementReferenceException, Exception):
            # The export dialog can re-render after every click. Locate it again.
            pass
        time.sleep(0.10)
    return False


def click_export_checkbox_using_events(
    driver: webdriver.Chrome,
    checkbox_id: str,
    strategy: int,
) -> None:
    """Click a React-controlled PARiM checkbox using progressively stronger methods."""
    checkbox = driver.find_element(By.ID, checkbox_id)
    label = driver.find_element(By.CSS_SELECTOR, f'label[for="{checkbox_id}"]')
    try:
        wrapper = label.find_element(By.CSS_SELECTOR, ".parim-checkbox-wrapper")
    except Exception:
        wrapper = label

    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});",
        label,
    )
    time.sleep(0.15)

    if strategy == 0:
        # Clicking the actual input produces the React onChange event most reliably.
        try:
            checkbox.click()
        except Exception:
            driver.execute_script("arguments[0].click();", checkbox)
        return

    if strategy == 1:
        # A real pointer click on the visible label/wrapper.
        try:
            ActionChains(driver).move_to_element(wrapper).pause(0.15).click().perform()
        except Exception:
            driver.execute_script("arguments[0].click();", label)
        return

    if strategy == 2:
        # JavaScript's native click still triggers React's delegated click/change logic.
        driver.execute_script("arguments[0].click();", checkbox)
        return

    # Final fallback. Dispatch a complete mouse-event sequence on the visible label.
    driver.execute_script(
        """
        const target = arguments[0];
        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        for (const name of events) {
          target.dispatchEvent(new MouseEvent(name, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: name.includes('down') ? 1 : 0
          }));
        }
        """,
        label,
    )


def set_export_checkbox(
    driver: webdriver.Chrome,
    checkbox_id: str,
    should_be_checked: bool,
    timeout_seconds: int,
) -> None:
    """Set one PARiM export checkbox and verify the live checked property."""
    column_name = EXPORT_COLUMN_LABELS.get(checkbox_id, checkbox_id)

    try:
        if export_checkbox_matches_state(driver, checkbox_id, should_be_checked):
            LOGGER.debug(
                "Export column already %s: %s",
                "selected" if should_be_checked else "cleared",
                column_name,
            )
            return
    except Exception as exc:
        raise AutomationError(
            f"Export column was not found: {column_name} ({checkbox_id})."
        ) from exc

    # React may rebuild the checkbox list after every click. Each attempt locates
    # the input and label again before clicking.
    for attempt, strategy in enumerate((0, 1, 2, 3), start=1):
        try:
            # The state may already have changed while React was rendering.
            if export_checkbox_matches_state(driver, checkbox_id, should_be_checked):
                break

            click_export_checkbox_using_events(driver, checkbox_id, strategy)

            if wait_for_export_checkbox_state(
                driver,
                checkbox_id,
                should_be_checked,
                timeout_seconds=min(max(timeout_seconds / 8, 1.5), 3.0),
            ):
                LOGGER.info(
                    "Export column %s: %s",
                    "selected" if should_be_checked else "cleared",
                    column_name,
                )
                return
        except (StaleElementReferenceException, ElementClickInterceptedException):
            pass
        except Exception as exc:
            LOGGER.debug(
                "Checkbox attempt %s failed for %s: %s",
                attempt,
                column_name,
                exc,
            )

        time.sleep(0.30)

    if export_checkbox_matches_state(driver, checkbox_id, should_be_checked):
        LOGGER.info(
            "Export column %s: %s",
            "selected" if should_be_checked else "cleared",
            column_name,
        )
        return

    raise AutomationError(
        f"Could not {'select' if should_be_checked else 'clear'} export column "
        f"{column_name} ({checkbox_id}). "
        f"Final state: {export_checkbox_debug_state(driver, checkbox_id)}"
    )


def configure_export_columns(driver: webdriver.Chrome, timeout_seconds: int) -> None:
    wait = WebDriverWait(driver, timeout_seconds)
    wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".ListTableExport__dialog-content-inner")
        )
    )

    def read_checkbox_ids() -> list[str]:
        return [
            element.get_attribute("id")
            for element in driver.find_elements(
                By.CSS_SELECTOR,
                ".ListTableExport__dialog-content-inner "
                "input[type='checkbox'][id^='choose-column-']",
            )
            if element.get_attribute("id")
        ]

    checkbox_ids = read_checkbox_ids()
    if not checkbox_ids:
        raise AutomationError("No export-column checkboxes were found.")

    expected_ids = set(EXPORT_COLUMN_IDS)
    missing_ids = expected_ids.difference(checkbox_ids)
    if missing_ids:
        raise AutomationError(
            "PARiM export dialog is missing expected columns: "
            + ", ".join(sorted(missing_ids))
        )

    LOGGER.info("Clearing all PARiM export columns")
    # Only click boxes that are currently selected. This avoids unnecessary
    # React re-renders and makes the reset deterministic.
    for checkbox_id in checkbox_ids:
        try:
            if export_checkbox_is_checked(driver, checkbox_id):
                set_export_checkbox(driver, checkbox_id, False, timeout_seconds)
                time.sleep(0.12)
        except StaleElementReferenceException:
            set_export_checkbox(driver, checkbox_id, False, timeout_seconds)

    # Confirm that reset has finished before selecting the required columns.
    uncleared = [
        checkbox_id
        for checkbox_id in read_checkbox_ids()
        if export_checkbox_is_checked(driver, checkbox_id)
    ]
    if uncleared:
        LOGGER.warning(
            "Retrying export-column reset for: %s",
            ", ".join(uncleared),
        )
        for checkbox_id in uncleared:
            set_export_checkbox(driver, checkbox_id, False, timeout_seconds)
            time.sleep(0.15)

    LOGGER.info("Selecting Start time, End time, Person, Phone, Position and Location")
    for checkbox_id in EXPORT_COLUMN_IDS:
        set_export_checkbox(driver, checkbox_id, True, timeout_seconds)
        # PARiM uses a controlled React list. A small pause prevents adjacent
        # updates, especially Start time and End time, from being dropped.
        time.sleep(0.30)

    # Perform two focused repair passes. This is especially useful for the two
    # time fields at the top of the Shift details group.
    for repair_pass in range(1, 3):
        missing_selections = [
            checkbox_id
            for checkbox_id in EXPORT_COLUMN_IDS
            if not export_checkbox_is_checked(driver, checkbox_id)
        ]
        if not missing_selections:
            break

        LOGGER.warning(
            "Export selection repair pass %s for: %s",
            repair_pass,
            ", ".join(
                EXPORT_COLUMN_LABELS.get(item, item) for item in missing_selections
            ),
        )
        for checkbox_id in missing_selections:
            set_export_checkbox(driver, checkbox_id, True, timeout_seconds)
            time.sleep(0.40)

    selected_ids = {
        checkbox_id
        for checkbox_id in read_checkbox_ids()
        if export_checkbox_is_checked(driver, checkbox_id)
    }

    # Clear any unexpected boxes one final time, without disturbing the six
    # required selections.
    extra_ids = selected_ids.difference(expected_ids)
    for checkbox_id in extra_ids:
        set_export_checkbox(driver, checkbox_id, False, timeout_seconds)
        time.sleep(0.15)

    selected_ids = {
        checkbox_id
        for checkbox_id in read_checkbox_ids()
        if export_checkbox_is_checked(driver, checkbox_id)
    }
    if selected_ids != expected_ids:
        missing_names = [
            EXPORT_COLUMN_LABELS.get(item, item)
            for item in EXPORT_COLUMN_IDS
            if item not in selected_ids
        ]
        raise AutomationError(
            "Unexpected export selection. "
            f"Missing: {', '.join(missing_names) or 'none'}. "
            f"Selected IDs: {', '.join(sorted(selected_ids)) or 'none'}."
        )

    LOGGER.info(
        "Export columns verified: Start time, End time, Person, Phone, Position and Location"
    )


def wait_for_csv_download(
    download_dir: Path,
    started_at: float,
    timeout_seconds: int,
) -> Path:
    deadline = time.time() + max(timeout_seconds, 60)
    last_candidate: Path | None = None
    last_size = -1
    stable_checks = 0

    while time.time() < deadline:
        partial_files = list(download_dir.glob("*.crdownload")) + list(
            download_dir.glob("*.tmp")
        )
        candidates = [
            path
            for path in download_dir.glob("*.csv")
            if path.stat().st_mtime >= started_at - 2
        ]

        if candidates and not partial_files:
            candidate = max(candidates, key=lambda item: item.stat().st_mtime)
            size = candidate.stat().st_size
            if candidate == last_candidate and size == last_size and size > 0:
                stable_checks += 1
            else:
                last_candidate = candidate
                last_size = size
                stable_checks = 0

            if stable_checks >= 2:
                return candidate

        time.sleep(0.5)

    raise AutomationError(
        f"CSV download did not finish within {max(timeout_seconds, 60)} seconds."
    )


def export_today_csv(
    driver: webdriver.Chrome,
    config: AppConfig,
) -> tuple[Path, str]:
    shift_date = select_today(driver, config.timeout_seconds)
    wait = WebDriverWait(driver, config.timeout_seconds)

    LOGGER.info("Opening export dialog")
    top_export_button = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//header[contains(@class,'TheLayout__header')]"
                "//div[contains(@class,'ToolButtonGroup')]"
                "/button[normalize-space()='Export']",
            )
        )
    )
    safe_click(driver, top_export_button)

    configure_export_columns(driver, config.timeout_seconds)

    export_button = wait.until(
        EC.element_to_be_clickable(
            (
                By.CSS_SELECTOR,
                ".dialog-button-bar form[action*='/schedule/download'] button.btn-success",
            )
        )
    )

    started_at = time.time()
    LOGGER.info("Downloading PARiM CSV")
    safe_click(driver, export_button)
    csv_path = wait_for_csv_download(
        config.download_dir, started_at, config.timeout_seconds
    )
    LOGGER.info("CSV downloaded: %s", csv_path)
    return csv_path, shift_date


def open_csv_dict_reader(path: Path) -> tuple[csv.DictReader, Any]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        handle = None
        try:
            handle = path.open("r", encoding=encoding, newline="")
            reader = csv.DictReader(handle)
            if reader.fieldnames:
                return reader, handle
            handle.close()
        except UnicodeDecodeError as exc:
            last_error = exc
            if handle is not None:
                handle.close()
    raise AutomationError(f"Could not read CSV encoding: {last_error}")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\ufeff", " ")).strip()


def normalise_uk_whatsapp_number(value: Any) -> str:
    """
    Convert common UK phone-number formats to +44XXXXXXXXXX.

    Examples:
    07468335174       -> +447468335174
    7468335174        -> +447468335174
    447468335174      -> +447468335174
    +44 7468 335174   -> +447468335174
    00447468335174    -> +447468335174
    +44 (0) 7468...   -> +447468335174
    """

    original = clean_text(value)

    if not original:
        return ""

    text = original

    # Remove an Excel decimal ending such as 7468335174.0
    text = re.sub(r"\.0$", "", text)

    # Remove an existing WhatsApp chat suffix.
    text = re.sub(
        r"@(c\.us|s\.whatsapp\.net)$",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Keep digits only.
    digits = re.sub(r"\D", "", text)

    if digits.startswith("0044"):
        # 00447468335174 -> 7468335174
        digits = digits[4:]

    elif digits.startswith("44"):
        # 447468335174 -> 7468335174
        digits = digits[2:]

    elif digits.startswith("0"):
        # 07468335174 -> 7468335174
        digits = digits[1:]

    elif len(digits) == 10:
        # 7468335174 is already the national number without zero.
        pass

    else:
        LOGGER.warning(
            "Could not convert phone number to UK format: %r",
            original,
        )
        return ""

    # Supports +44 (0) 7468 335174.
    if digits.startswith("0"):
        digits = digits[1:]

    # Standard UK number after +44 normally contains ten digits.
    if not re.fullmatch(r"\d{10}", digits):
        LOGGER.warning(
            "Invalid UK phone number after formatting: %r -> %r",
            original,
            digits,
        )
        return ""

    return "+44" + digits


def _extract_datetime(value: str) -> datetime | None:
    """Parse the date/time formats normally produced by PARiM exports."""
    text = clean_text(value)
    if not text:
        return None

    formats = (
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    return None


def _format_time_24(value: str, *, field_name: str, row_number: int) -> str:
    """Return a time without a colon, for example 0645 or 1900."""
    text = clean_text(value)
    parsed = _extract_datetime(text)
    if parsed is not None:
        return parsed.strftime("%H%M")

    # Also accept time-only values such as 06:45, 0645 or 6:45.
    match = re.search(r"(?:^|\s)([01]?\d|2[0-3]):?([0-5]\d)(?::[0-5]\d)?$", text)
    if match:
        return f"{int(match.group(1)):02d}{int(match.group(2)):02d}"

    raise AutomationError(
        f"Could not read {field_name} on CSV row {row_number}: {text!r}"
    )


def parse_shift_csv(path: Path) -> list[dict[str, str]]:
    reader, handle = open_csv_dict_reader(path)
    try:
        original_headers = [clean_text(name) for name in (reader.fieldnames or [])]
        header_map = {header.lower(): header for header in original_headers}
        missing = [
            column for column in REQUIRED_CSV_COLUMNS if column.lower() not in header_map
        ]
        if missing:
            raise AutomationError(
                "CSV is missing required columns: " + ", ".join(missing)
            )

        rows: list[dict[str, str]] = []
        for csv_row_number, raw_row in enumerate(reader, start=2):
            normalised_raw = {clean_text(key): value for key, value in raw_row.items()}

            def csv_value(column: str) -> str:
                source_header = header_map.get(column.lower())
                return clean_text(normalised_raw.get(source_header, "")) if source_header else ""

            raw_start = csv_value("Start time")
            raw_end = csv_value("End time")
            start_time = _format_time_24(
                raw_start, field_name="Start time", row_number=csv_row_number
            )
            end_time = _format_time_24(
                raw_end, field_name="End time", row_number=csv_row_number
            )
            start_datetime = _extract_datetime(raw_start)

            record = {
                "StartTime": start_time,
                "EndTime": end_time,
                "ShiftTime": f"{start_time} - {end_time}",
                "ShiftDate": start_datetime.date().isoformat() if start_datetime else "",
                "Person": csv_value("Person"),
                "Phone": normalise_uk_whatsapp_number(
    csv_value("Phone")
),
                "Position": csv_value("Position"),
                "Location": csv_value("Location"),
            }
            
            
            if any(record[column] for column in ("Person", "Phone", "Position", "Location")):
                rows.append(record)
    finally:
        handle.close()

    if not rows:
        raise AutomationError("The downloaded CSV contains no shift rows.")

    LOGGER.info("Parsed %d shift rows with 24-hour start/end times", len(rows))
    return rows


def date_from_rows(rows: Iterable[dict[str, str]]) -> str:
    dates = [clean_text(row.get("ShiftDate", "")) for row in rows]
    dates = [value for value in dates if value]
    if dates:
        unique_dates = sorted(set(dates))
        if len(unique_dates) > 1:
            raise AutomationError(
                "The CSV contains shifts from more than one date: "
                + ", ".join(unique_dates)
            )
        return unique_dates[0]
    return ""


def normalise_date_argument(value: str) -> str:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise AutomationError("Date must be YYYY-MM-DD or DD/MM/YYYY.")


def date_from_filename(path: Path) -> str:
    match = re.search(r"(20\d{2})[-_](\d{2})[-_](\d{2})", path.stem)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    return datetime.now().date().isoformat()


def upload_rows_to_apps_script(
    config: AppConfig,
    rows: Iterable[dict[str, str]],
    shift_date: str,
    source_filename: str,
) -> dict[str, Any]:
    payload = {
        "token": config.api_token,
        "action": "upsertDailyShifts",
        "date": shift_date,
        "sourceFilename": source_filename,
        "rows": list(rows),
    }

    LOGGER.info("Sending shifts to Google Apps Script")
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = requests.post(config.sheet_url, json=payload, timeout=90)
            response.raise_for_status()
            try:
                result = response.json()
            except json.JSONDecodeError as exc:
                raise AutomationError(
                    "Apps Script did not return JSON. Response starts with: "
                    + response.text[:250]
                ) from exc

            if not result.get("ok"):
                raise AutomationError(
                    "Apps Script rejected the upload: "
                    + str(result.get("error") or result)
                )

            LOGGER.info(
                "Google Sheet updated with %s rows", result.get("rowCount", "the imported")
            )
            return result
        except (requests.RequestException, AutomationError) as exc:
            last_error = exc
            if attempt == 3:
                break
            LOGGER.warning("Upload attempt %d failed. Retrying...", attempt)
            time.sleep(attempt * 2)

    raise AutomationError(f"Could not update Google Sheet: {last_error}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Log in to PARiM, export today's start/end time, person, phone, "
            "position and location CSV, then append or update that date in "
            "the formatted Daily Shifts Google Sheet."
        )
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="Skip Selenium and upload an existing PARiM shifts CSV.",
    )
    parser.add_argument(
        "--date",
        help="Shift date as YYYY-MM-DD or DD/MM/YYYY. Used with --csv when supplied.",
    )
    parser.add_argument(
        "--no-upload",
        action="store_true",
        help="Export/parse the CSV but do not send it to Google Sheets.",
    )
    return parser.parse_args()


def main() -> int:
    configure_logging()
    args = parse_args()

    require_browser = args.csv is None
    require_upload = not args.no_upload
    config = AppConfig.from_env(
        require_browser=require_browser,
        require_upload=require_upload,
    )

    driver: webdriver.Chrome | None = None
    csv_path: Path
    shift_date: str

    try:
        if args.csv is not None:
            csv_path = args.csv.expanduser().resolve()
            if not csv_path.is_file():
                raise AutomationError(f"CSV file does not exist: {csv_path}")
            rows = parse_shift_csv(csv_path)
            shift_date = (
                normalise_date_argument(args.date)
                if args.date
                else date_from_rows(rows) or date_from_filename(csv_path)
            )
        else:
            driver = build_driver(config)
            login(driver, config)
            open_shifts_list(driver, config.timeout_seconds)
            csv_path, shift_date = export_today_csv(driver, config)
            rows = parse_shift_csv(csv_path)

        if args.no_upload:
            LOGGER.info(
                "No-upload mode complete. Date: %s | Rows: %d | CSV: %s",
                shift_date,
                len(rows),
                csv_path,
            )
            return 0

        result = upload_rows_to_apps_script(
            config,
            rows,
            shift_date,
            csv_path.name,
        )
        LOGGER.info(
            "Completed successfully. Date: %s | Rows: %d | Sheet: %s",
            shift_date,
            len(rows),
            result.get("spreadsheetUrl", "updated"),
        )

        if not config.keep_downloaded_csv and args.csv is None:
            csv_path.unlink(missing_ok=True)
            LOGGER.info("Deleted downloaded CSV after successful upload")

        return 0
    except AutomationError as exc:
        LOGGER.error("%s", exc)
        return 1
    except Exception:
        LOGGER.exception("Unexpected failure")
        return 1
    finally:
        if driver is not None:
            temp_profile_dir = getattr(driver, "_parim_temp_profile_dir", None)
            try:
                driver.quit()
            finally:
                if temp_profile_dir:
                    shutil.rmtree(temp_profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
