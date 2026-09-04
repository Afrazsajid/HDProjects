"""
SIA Licence Screenshot Tool with Google Sheet Queue - FAST VERSION
=================================================================

Speed changes compared with the original:
- Chrome uses eager page loading.
- The SIA search page is reused with browser Back instead of reloading from scratch for every badge.
- "Search by licence number" is selected with JavaScript, without Selenium clickable waits.
- Licence value is inserted with JavaScript and the form is submitted with requestSubmit().
- Fixed sleeps (0.2 / 0.3 / 0.5 sec) have been removed.
- Wait polling is 0.10 sec instead of Selenium's default 0.50 sec.
- Optional heading lookup never waits.
- Screenshots use Chrome DevTools clipped capture directly, so no temporary full screenshot or Pillow crop is needed.
- Google Apps Script requests reuse one HTTP session.

Install:
    pip install selenium requests

Run from Google Sheet queue:
    python sia_sheet_checker_FAST.py

Run one manual badge:
    python sia_sheet_checker_FAST.py --licence 1017653273904488

Run a limited number:
    python sia_sheet_checker_FAST.py --limit 10

If your internet/SIA site is unusually slow, increase:
    --ui-timeout 7 --result-timeout 12
"""

import argparse
import base64
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


# ==================================================
# CONFIG
# ==================================================

WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyJ8LRPZKOgUJOrhuI9PpwdLj6Su7-C2oYhW01ocfXSNgCMlAhnQwt95Iv0gRo03J40/exec"
API_TOKEN = "xyx4321765"

SEARCH_URL = "https://rolh.services.sia.homeoffice.gov.uk/"
OUTPUT_DIR = "sia_screenshots"

# Fast defaults. These are maximum waits, not fixed delays.
DEFAULT_UI_TIMEOUT = 5.0
DEFAULT_RESULT_TIMEOUT = 8.0
POLL_FREQUENCY = 0.10

RESULT_SELECTOR = "[data-testid='licence-detail-card'], div.rolh-result-card"
LICENCE_RADIO_ID = "search-hub-mode-by-licence"
LICENCE_INPUT_ID = "licenceNumber"


# ==================================================
# HTTP / GOOGLE SHEET API
# ==================================================

def make_http_session() -> requests.Session:
    """Persistent HTTP session so each Apps Script request does not create a new connection."""
    session = requests.Session()

    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.15,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(("GET", "POST")),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=2, pool_maxsize=2)
    session.mount("https://", adapter)
    session.headers.update({"Connection": "keep-alive"})
    return session


HTTP = make_http_session()


def sheet_get_next_badge(web_app_url: str, api_token: str) -> Optional[Dict[str, object]]:
    """GET the next row where completed is empty."""
    response = HTTP.get(
        web_app_url,
        params={
            "token": api_token,
            "action": "next",
        },
        timeout=(5, 10),
    )
    response.raise_for_status()
    data = response.json()

    if not data.get("ok"):
        raise RuntimeError(f"Apps Script GET error: {data.get('error')}")

    if not data.get("hasBadge"):
        return None

    item = data.get("item") or {}
    badge = clean_badge(str(item.get("badgeNumber", "")))
    row_number = item.get("rowNumber")

    if not badge or not row_number:
        raise RuntimeError(f"Invalid Apps Script response: {data}")

    return {
        "badgeNumber": badge,
        "rowNumber": int(row_number),
    }


def sheet_mark_done(
    web_app_url: str,
    api_token: str,
    badge_number: str,
    row_number: int,
    completed_value: str = "done",
) -> Dict[str, object]:
    """POST back to Apps Script and write done/error."""
    response = HTTP.post(
        web_app_url,
        json={
            "token": api_token,
            "action": "markDone",
            "badgeNumber": badge_number,
            "rowNumber": row_number,
            "completed": completed_value,
        },
        timeout=(5, 10),
    )
    response.raise_for_status()
    data = response.json()

    if not data.get("ok"):
        raise RuntimeError(f"Apps Script POST error: {data.get('error')}")

    return data


def validate_web_app_url(web_app_url: str) -> None:
    if not web_app_url or "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE" in web_app_url:
        raise RuntimeError(
            "Please paste your deployed Apps Script Web App URL into WEB_APP_URL "
            "or pass it using --web-app-url."
        )


# ==================================================
# SELENIUM - FAST PATH
# ==================================================

def make_driver(headless: bool = False) -> webdriver.Chrome:
    opts = Options()

    # Return from navigation at DOMContentLoaded instead of waiting for every resource.
    opts.page_load_strategy = "eager"

    if headless:
        opts.add_argument("--headless=new")

    opts.add_argument("--window-size=1280,1000")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--disable-extensions")
    opts.add_argument("--disable-background-networking")
    opts.add_argument("--disable-default-apps")
    opts.add_argument("--disable-sync")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=opts)

    # Do not let a bad page load block Selenium for a long time.
    driver.set_page_load_timeout(12)
    driver.set_script_timeout(5)

    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": (
                "Object.defineProperty(navigator, 'webdriver', "
                "{get: () => undefined});"
            )
        },
    )

    return driver


def fast_wait(driver: webdriver.Chrome, timeout: float) -> WebDriverWait:
    return WebDriverWait(
        driver,
        timeout,
        poll_frequency=POLL_FREQUENCY,
        ignored_exceptions=(),
    )


def disable_page_animations(driver: webdriver.Chrome) -> None:
    """Remove cosmetic animation/scroll delays. Safe to call repeatedly."""
    try:
        driver.execute_script(
            """
            if (!document.getElementById('__sia_fast_css')) {
                const style = document.createElement('style');
                style.id = '__sia_fast_css';
                style.textContent = `
                    *, *::before, *::after {
                        animation-duration: 0s !important;
                        animation-delay: 0s !important;
                        transition-duration: 0s !important;
                        transition-delay: 0s !important;
                        scroll-behavior: auto !important;
                    }
                `;
                document.documentElement.appendChild(style);
            }
            """
        )
    except Exception:
        pass


def _visible_licence_input(driver: webdriver.Chrome):
    """Return visible licence input immediately, or False for WebDriverWait."""
    try:
        elements = driver.find_elements(By.ID, LICENCE_INPUT_ID)
        for element in elements:
            if element.is_displayed() and element.is_enabled():
                return element
    except Exception:
        pass
    return False


def _licence_radio(driver: webdriver.Chrome):
    try:
        elements = driver.find_elements(By.ID, LICENCE_RADIO_ID)
        return elements[0] if elements else False
    except Exception:
        return False


def select_licence_mode_fast(driver: webdriver.Chrome, ui_timeout: float):
    """
    Make the licence-number input available as quickly as possible.
    No scroll, no element_to_be_clickable wait, no sleep.
    """
    # On browser Back, the form is often already restored. Avoid clicking anything.
    inp = _visible_licence_input(driver)
    if inp:
        return inp

    radio = fast_wait(driver, ui_timeout).until(_licence_radio)

    # JavaScript click avoids Selenium's interactability/scroll checks.
    driver.execute_script("arguments[0].click();", radio)

    return fast_wait(driver, ui_timeout).until(_visible_licence_input)


def set_input_value_fast(driver: webdriver.Chrome, inp, value: str) -> None:
    """Set the input value with native JS events. Faster than clear()+send_keys()."""
    driver.execute_script(
        """
        const el = arguments[0];
        const value = arguments[1];
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        """,
        inp,
        value,
    )


def submit_form_fast(driver: webdriver.Chrome, inp) -> None:
    """Submit the licence form without scroll/click waits."""
    driver.execute_script(
        """
        const input = arguments[0];
        const form = input.closest('form');
        if (!form) throw new Error('Licence form not found');

        const button = form.querySelector("button[type='submit'], input[type='submit']");
        if (form.requestSubmit) {
            button ? form.requestSubmit(button) : form.requestSubmit();
        } else if (button) {
            button.click();
        } else {
            form.submit();
        }
        """,
        inp,
    )


def _find_result_card(driver: webdriver.Chrome):
    try:
        cards = driver.find_elements(By.CSS_SELECTOR, RESULT_SELECTOR)
        for card in cards:
            if card.is_displayed():
                return card
    except Exception:
        pass
    return False


def prepare_search_form(
    driver: webdriver.Chrome,
    ui_timeout: float,
    first_search: bool,
) -> Optional[object]:
    """
    First badge: load the SIA homepage.
    Later badges: use browser Back to restore the search form quickly.
    Falls back to a fresh GET if Back does not restore the form.
    """
    if first_search:
        try:
            driver.get(SEARCH_URL)
        except TimeoutException:
            # With eager loading the useful DOM may already be available.
            pass
    else:
        try:
            driver.back()
            disable_page_animations(driver)
            try:
                return fast_wait(driver, min(ui_timeout, 2.5)).until(_visible_licence_input)
            except TimeoutException:
                pass
        except Exception:
            pass

        # Browser history was not usable. Fresh load fallback.
        try:
            driver.get(SEARCH_URL)
        except TimeoutException:
            pass

    disable_page_animations(driver)

    try:
        return select_licence_mode_fast(driver, ui_timeout)
    except Exception as exc:
        print("  [!] Could not open licence-number search quickly.")
        print("      Page title :", driver.title)
        print("      Current URL:", driver.current_url)
        print(f"      Error      : {exc}")
        return None


def get_field_fast(result_card, label: str) -> str:
    """Read one labelled value without any waits."""
    try:
        xpath = f".//p[normalize-space()={label!r}]/following-sibling::p[1]"
        value_element = result_card.find_element(By.XPATH, xpath)
        text = value_element.text.strip()
        if text:
            return text
    except Exception:
        pass

    try:
        labels = result_card.find_elements(By.CSS_SELECTOR, "p.govuk-body")
        target = label.casefold()
        for label_el in labels:
            if label_el.text.strip().casefold() == target:
                value_el = label_el.find_element(By.XPATH, "following-sibling::p[1]")
                return value_el.text.strip() or "UNKNOWN"
    except Exception:
        pass

    return "UNKNOWN"


def search_licence(
    driver: webdriver.Chrome,
    licence_number: str,
    ui_timeout: float,
    result_timeout: float,
    first_search: bool,
) -> Optional[Dict[str, object]]:
    """Fast SIA licence search."""
    inp = prepare_search_form(
        driver=driver,
        ui_timeout=ui_timeout,
        first_search=first_search,
    )
    if inp is None:
        return None

    try:
        set_input_value_fast(driver, inp, licence_number)
        submit_form_fast(driver, inp)
    except Exception as exc:
        print(f"  [!] Could not submit licence search: {exc}")
        return None

    try:
        result_card = fast_wait(driver, result_timeout).until(_find_result_card)
    except TimeoutException:
        print(
            f"  [!] No result card within {result_timeout:g}s for "
            f"{licence_number}. Page: {driver.title}"
        )
        return None

    # Result already exists. Do NOT wait 30 seconds for an optional heading.
    heading = None
    try:
        headings = driver.find_elements(By.CSS_SELECTOR, "h1.govuk-heading-l")
        if headings:
            heading = headings[0]
    except Exception:
        pass

    first_name = get_field_fast(result_card, "First name")
    surname = get_field_fast(result_card, "Surname")

    return {
        "first_name": first_name,
        "surname": surname,
        "licence": licence_number,
        "panel": result_card,
        "heading": heading,
        "result_card": result_card,
    }


# ==================================================
# SCREENSHOT - NATIVE CHROME CLIP
# ==================================================

def screenshot_panel(
    driver: webdriver.Chrome,
    panel,
    first_name: str,
    surname: str,
    licence: str,
    output_dir: Path,
    heading=None,
    result_card=None,
) -> Path:
    """
    Capture only the result area using Chrome DevTools.
    This is faster than save_screenshot -> open Pillow -> crop -> save again.
    """
    top_element = heading or panel
    bottom_element = result_card or panel

    safe_first = safe_filename(first_name)
    safe_surname = safe_filename(surname)
    out_name = f"{safe_first}_{safe_surname}_{safe_filename(licence)}.png"
    out_path = output_dir / out_name

    try:
        rect = driver.execute_script(
            """
            const topEl = arguments[0];
            const bottomEl = arguments[1];
            const a = topEl.getBoundingClientRect();
            const b = bottomEl.getBoundingClientRect();

            const marginX = 18;
            const marginTop = 8;
            const marginBottom = 18;

            const left = Math.max(0, Math.min(a.left, b.left) + window.scrollX - marginX);
            const top = Math.max(0, Math.min(a.top, b.top) + window.scrollY - marginTop);
            const right = Math.max(a.right, b.right) + window.scrollX + marginX;
            const bottom = Math.max(a.bottom, b.bottom) + window.scrollY + marginBottom;

            return {
                x: left,
                y: top,
                width: Math.max(1, right - left),
                height: Math.max(1, bottom - top)
            };
            """,
            top_element,
            bottom_element,
        )

        shot = driver.execute_cdp_cmd(
            "Page.captureScreenshot",
            {
                "format": "png",
                "fromSurface": True,
                "captureBeyondViewport": True,
                "clip": {
                    "x": float(rect["x"]),
                    "y": float(rect["y"]),
                    "width": float(rect["width"]),
                    "height": float(rect["height"]),
                    "scale": 1,
                },
            },
        )
        out_path.write_bytes(base64.b64decode(shot["data"]))
        return out_path

    except Exception as exc:
        # Very small compatibility fallback. No deliberate delay.
        print(f"  [i] Native clipped screenshot fallback: {exc}")
        try:
            panel.screenshot(str(out_path))
        except Exception:
            driver.save_screenshot(str(out_path))
        return out_path


def save_error_screenshot(driver: webdriver.Chrome, licence: str, output_dir: Path) -> Optional[Path]:
    try:
        out_path = output_dir / f"ERROR_{safe_filename(licence)}.png"
        driver.save_screenshot(str(out_path))
        return out_path
    except Exception:
        return None


# ==================================================
# PROCESSING
# ==================================================

def process_single_licence(
    driver: webdriver.Chrome,
    licence_number: str,
    output_dir: Path,
    ui_timeout: float,
    result_timeout: float,
    first_search: bool,
) -> Tuple[bool, Optional[Path]]:
    licence_number = clean_badge(licence_number)

    if not licence_number:
        print("  [!] Empty badge number.")
        return False, None

    print(f"Searching: {licence_number}")

    result = search_licence(
        driver=driver,
        licence_number=licence_number,
        ui_timeout=ui_timeout,
        result_timeout=result_timeout,
        first_search=first_search,
    )

    if result is None:
        error_path = save_error_screenshot(driver, licence_number, output_dir)
        if error_path:
            print(f"  [!] Failed. Error screenshot saved: {error_path}")
        else:
            print("  [!] Failed. Could not save error screenshot.")
        return False, error_path

    path = screenshot_panel(
        driver=driver,
        panel=result["panel"],
        first_name=str(result["first_name"]),
        surname=str(result["surname"]),
        licence=str(result["licence"]),
        output_dir=output_dir,
        heading=result.get("heading"),
        result_card=result.get("result_card"),
    )

    print(f"  [✓] {result['first_name']} {result['surname']}  →  {path}")
    return True, path


def process_sheet_queue(
    web_app_url: str,
    api_token: str,
    output_dir: Path,
    limit: Optional[int] = None,
    headless: bool = False,
    mark_failed_as_done: bool = True,
    ui_timeout: float = DEFAULT_UI_TIMEOUT,
    result_timeout: float = DEFAULT_RESULT_TIMEOUT,
) -> None:
    validate_web_app_url(web_app_url)
    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)
    processed = 0
    first_search = True

    try:
        while True:
            if limit is not None and processed >= limit:
                print(f"\nLimit reached: {limit}")
                break

            item = sheet_get_next_badge(web_app_url, api_token)

            if not item:
                print("\nNo unchecked badges found in the sheet.")
                break

            badge_number = str(item["badgeNumber"])
            row_number = int(item["rowNumber"])

            print(f"\nSheet row {row_number}: {badge_number}")

            success, _path = process_single_licence(
                driver=driver,
                licence_number=badge_number,
                output_dir=output_dir,
                ui_timeout=ui_timeout,
                result_timeout=result_timeout,
                first_search=first_search,
            )
            first_search = False

            if success:
                sheet_status = "done"
            elif mark_failed_as_done:
                sheet_status = "error"
            else:
                print("  [!] Sheet not updated because the badge failed.")
                print("      Run again after fixing the issue.")
                break

            sheet_mark_done(
                web_app_url=web_app_url,
                api_token=api_token,
                badge_number=badge_number,
                row_number=row_number,
                completed_value=sheet_status,
            )

            if sheet_status == "done":
                print(f"  [✓] Sheet updated: row {row_number} marked done")
            else:
                print(f"  [!] Sheet updated: row {row_number} marked error")

            processed += 1

        print(f"\nFinished. Total processed: {processed}")

    finally:
        driver.quit()


def process_manual_licences(
    licence_numbers: List[str],
    output_dir: Path,
    headless: bool = False,
    ui_timeout: float = DEFAULT_UI_TIMEOUT,
    result_timeout: float = DEFAULT_RESULT_TIMEOUT,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)
    first_search = True

    try:
        for licence in licence_numbers:
            process_single_licence(
                driver=driver,
                licence_number=licence,
                output_dir=output_dir,
                ui_timeout=ui_timeout,
                result_timeout=result_timeout,
                first_search=first_search,
            )
            first_search = False
    finally:
        driver.quit()


# ==================================================
# HELPERS
# ==================================================

def clean_badge(value: str) -> str:
    # Keep compatibility with your existing sheet values while removing spaces.
    return re.sub(r"\s+", "", str(value or "")).strip()


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    cleaned = cleaned.strip("_")
    return cleaned or "UNKNOWN"


def get_app_base_dir() -> Path:
    """Return the folder to use for output when running as .py or frozen .exe."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def resolve_output_dir(output_dir_value: str) -> Path:
    """Keep relative screenshot folders next to the script or EXE."""
    output_dir = Path(output_dir_value)
    if output_dir.is_absolute():
        return output_dir
    return get_app_base_dir() / output_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="FAST SIA badge checker with Google Sheet queue."
    )

    parser.add_argument(
        "--web-app-url",
        default=WEB_APP_URL,
        help="Apps Script Web App URL.",
    )
    parser.add_argument(
        "--api-token",
        default=API_TOKEN,
        help="Token. Must match the Apps Script token.",
    )
    parser.add_argument(
        "--licence",
        "--license",
        nargs="+",
        help="Manual mode. Check one or more licence numbers directly.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of sheet rows to process.",
    )
    parser.add_argument(
        "--output-dir",
        default=OUTPUT_DIR,
        help="Folder where screenshots will be saved.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chrome headless.",
    )
    parser.add_argument(
        "--do-not-mark-failed",
        action="store_true",
        help="If a badge fails, leave completed empty instead of marking error.",
    )
    parser.add_argument(
        "--ui-timeout",
        type=float,
        default=DEFAULT_UI_TIMEOUT,
        help=f"Maximum seconds for SIA form controls. Default {DEFAULT_UI_TIMEOUT:g}.",
    )
    parser.add_argument(
        "--result-timeout",
        type=float,
        default=DEFAULT_RESULT_TIMEOUT,
        help=f"Maximum seconds for result card. Default {DEFAULT_RESULT_TIMEOUT:g}.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = resolve_output_dir(args.output_dir)

    if args.ui_timeout <= 0 or args.result_timeout <= 0:
        raise ValueError("Timeout values must be greater than 0.")

    if args.licence:
        process_manual_licences(
            licence_numbers=args.licence,
            output_dir=output_dir,
            headless=args.headless,
            ui_timeout=args.ui_timeout,
            result_timeout=args.result_timeout,
        )
        return

    process_sheet_queue(
        web_app_url=args.web_app_url,
        api_token=args.api_token,
        output_dir=output_dir,
        limit=args.limit,
        headless=args.headless,
        mark_failed_as_done=not args.do_not_mark_failed,
        ui_timeout=args.ui_timeout,
        result_timeout=args.result_timeout,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")
        sys.exit(130)
    except Exception as exc:
        print(f"\n[FATAL] {exc}")
        sys.exit(1)
