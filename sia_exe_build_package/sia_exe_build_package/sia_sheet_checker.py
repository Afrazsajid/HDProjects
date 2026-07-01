"""
SIA Licence Screenshot Tool with Google Sheet Queue
==================================================

Google Sheet tab:
    sia badge checker

Columns:
    A: sia badge number
    B: completed

Flow:
    1. Python sends GET request to Apps Script.
    2. Apps Script returns the next badge where completed is empty.
    3. Selenium opens SIA public register and screenshots the result panel.
    4. Python sends POST request to Apps Script.
    5. Apps Script writes "done" in the completed column.

Install:
    pip install selenium pillow requests

Run from Google Sheet queue:
    python sia_sheet_checker.py

Run one manual badge:
    python sia_sheet_checker.py --licence 1017653273904488

Run a limited number from the sheet:
    python sia_sheet_checker.py --limit 10
"""

import argparse
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# ==================================================
# CONFIG
# ==================================================

# Paste your deployed Google Apps Script Web App URL here.
# Example:
# WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec"
WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyJ8LRPZKOgUJOrhuI9PpwdLj6Su7-C2oYhW01ocfXSNgCMlAhnQwt95Iv0gRo03J40/exec"

# Must match API_TOKEN inside the Apps Script.
API_TOKEN = "xyx4321765"

# Working SIA public register URL from your current script.
SEARCH_URL = "https://services.sia.homeoffice.gov.uk/PublicRegister/SearchPublicRegisterNew?aspxerrorpath=/PublicRegister/SearchPublicRegisterByLicence"

OUTPUT_DIR = "sia_screenshots"


# ==================================================
# GOOGLE SHEET API
# ==================================================

def sheet_get_next_badge(web_app_url: str, api_token: str) -> Optional[Dict[str, object]]:
    """GET the next row where completed is empty."""
    response = requests.get(
        web_app_url,
        params={
            "token": api_token,
            "action": "next",
        },
        timeout=30,
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
    """POST back to Apps Script and mark the badge as done."""
    response = requests.post(
        web_app_url,
        json={
            "token": api_token,
            "action": "markDone",
            "badgeNumber": badge_number,
            "rowNumber": row_number,
            "completed": completed_value,
        },
        timeout=30,
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
# SELENIUM
# ==================================================

def make_driver(headless: bool = False) -> webdriver.Chrome:
    opts = Options()

    # Government/public register sites can behave better in visible mode.
    # Use --headless only if you have tested it successfully on your machine.
    if headless:
        opts.add_argument("--headless=new")

    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=opts)

    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": (
                "Object.defineProperty(navigator, 'webdriver', "
                "{get: () => undefined})"
            )
        },
    )

    return driver


def search_licence(driver: webdriver.Chrome, licence_number: str) -> Optional[Dict[str, object]]:
    driver.get(SEARCH_URL)
    wait = WebDriverWait(driver, 30)

    try:
        inp = wait.until(EC.element_to_be_clickable((By.ID, "LicenseNo")))
    except Exception:
        print("  [!] Could not find LicenseNo input.")
        print("      Page title :", driver.title)
        print("      Current URL:", driver.current_url)
        return None

    inp.clear()
    inp.send_keys(licence_number)
    time.sleep(0.3)

    try:
        licence_form = driver.find_element(
            By.CSS_SELECTOR,
            "form[action='/PublicRegister/SearchPublicRegisterByLicence']",
        )
        search_btn = licence_form.find_element(By.CSS_SELECTOR, "input.btn_search")
        search_btn.click()
    except Exception as exc:
        print(f"  [!] Could not click licence-form Search button: {exc}")
        return None

    try:
        panel = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.container.well"))
        )
    except Exception:
        print(f"  [!] No result panel for {licence_number}. Page: {driver.title}")
        return None

    time.sleep(0.5)

    def get_field(label: str) -> str:
        try:
            for span in driver.find_elements(By.CSS_SELECTOR, "span.ax_paragraph"):
                if label.lower() in span.text.strip().lower():
                    parent = span.find_element(By.XPATH, "..")
                    value = parent.find_element(By.CSS_SELECTOR, "div.form-group div")
                    return value.text.strip()
        except Exception:
            pass
        return "UNKNOWN"

    return {
        "first_name": get_field("First name"),
        "surname": get_field("Surname"),
        "licence": licence_number,
        "panel": panel,
    }


def screenshot_panel(
    driver: webdriver.Chrome,
    panel,
    first_name: str,
    surname: str,
    licence: str,
    output_dir: Path,
) -> Path:
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", panel)
    time.sleep(0.5)

    tmp = output_dir / "_tmp_full.png"
    safe_first = safe_filename(first_name)
    safe_surname = safe_filename(surname)
    out_name = f"{safe_first}_{safe_surname}_{licence}.png"
    out_path = output_dir / out_name

    driver.save_screenshot(str(tmp))

    try:
        from PIL import Image

        img = Image.open(tmp)
        loc = panel.location_once_scrolled_into_view
        size = panel.size
        dpr = driver.execute_script("return window.devicePixelRatio") or 1

        margin = 15
        left = max(0, int(loc["x"] * dpr) - margin)
        top = max(0, int(loc["y"] * dpr) - margin)
        right = min(img.width, int((loc["x"] + size["width"]) * dpr) + margin)
        bottom = min(img.height, int((loc["y"] + size["height"]) * dpr) + margin)

        img.crop((left, top, right, bottom)).save(str(out_path))
        tmp.unlink(missing_ok=True)

    except ImportError:
        tmp.rename(out_path)
        print("  [i] Pillow not installed. Saved full-page screenshot instead.")

    return out_path


def save_error_screenshot(driver: webdriver.Chrome, licence: str, output_dir: Path) -> Optional[Path]:
    try:
        out_path = output_dir / f"ERROR_{licence}.png"
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
) -> Tuple[bool, Optional[Path]]:
    licence_number = clean_badge(licence_number)

    if not licence_number:
        print("  [!] Empty badge number.")
        return False, None

    print(f"Searching: {licence_number}")

    result = search_licence(driver, licence_number)

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
) -> None:
    validate_web_app_url(web_app_url)

    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)
    processed = 0

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

            success, _path = process_single_licence(driver, badge_number, output_dir)

            if success or mark_failed_as_done:
                sheet_mark_done(
                    web_app_url=web_app_url,
                    api_token=api_token,
                    badge_number=badge_number,
                    row_number=row_number,
                    completed_value="done",
                )
                print(f"  [✓] Sheet updated: row {row_number} marked done")
            else:
                print("  [!] Sheet not updated because the badge failed.")
                print("      Run again after fixing the issue.")
                break

            processed += 1

        print(f"\nFinished. Total processed: {processed}")

    finally:
        driver.quit()


def process_manual_licences(
    licence_numbers: List[str],
    output_dir: Path,
    headless: bool = False,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    driver = make_driver(headless=headless)

    try:
        for licence in licence_numbers:
            process_single_licence(driver, licence, output_dir)
    finally:
        driver.quit()


# ==================================================
# HELPERS
# ==================================================

def clean_badge(value: str) -> str:
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
    parser = argparse.ArgumentParser(description="SIA badge checker with Google Sheet queue.")

    parser.add_argument(
        "--web-app-url",
        default=WEB_APP_URL,
        help="Apps Script Web App URL. You can also paste it into WEB_APP_URL in the file.",
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
        help="Manual mode. Check one or more licence numbers directly, without using Google Sheet.",
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
        help="Run Chrome headless. Use only if it works on your machine.",
    )
    parser.add_argument(
        "--do-not-mark-failed",
        action="store_true",
        help="If a badge fails, leave completed empty instead of marking done.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = resolve_output_dir(args.output_dir)

    if args.licence:
        process_manual_licences(
            licence_numbers=args.licence,
            output_dir=output_dir,
            headless=args.headless,
        )
        return

    process_sheet_queue(
        web_app_url=args.web_app_url,
        api_token=args.api_token,
        output_dir=output_dir,
        limit=args.limit,
        headless=args.headless,
        mark_failed_as_done=not args.do_not_mark_failed,
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
