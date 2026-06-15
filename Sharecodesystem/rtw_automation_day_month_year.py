import os
import re
import time
import shutil
import logging
import requests
from pathlib import Path
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


# ==================================================
# CONFIG
# ==================================================

# Paste your Apps Script Web App URL here
WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw1goxZyT4n6bemiK1bjGEVL5sgD0jRghhsXgn95wGBQNlGAjIaYzw46xbRZGQOw2ZP/exec"

# Must match the token inside your Apps Script
API_TOKEN = "xyx4321765"

COMPANY_NAME = "HandDRecruitment"

# Official GOV.UK start page
GOV_START_URL = "https://www.gov.uk/view-right-to-work"

# Fallback service URL
RTW_SERVICE_URL = "https://right-to-work.service.gov.uk/rtw-view/checker"

# If True, it will keep checking rows until no pending share codes are left
PROCESS_ALL_PENDING = True

# Keep False while testing so you can see the browser
HEADLESS = False

BASE_DIR = Path.cwd()
DOWNLOAD_DIR = BASE_DIR / "rtw_downloads"
SCREENSHOT_DIR = BASE_DIR / "rtw_screenshots"

DOWNLOAD_DIR.mkdir(exist_ok=True)
SCREENSHOT_DIR.mkdir(exist_ok=True)


# ==================================================
# LOGGING
# ==================================================

logging.basicConfig(
    filename="rtw_automation.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)


# ==================================================
# GOOGLE SHEET API FUNCTIONS
# ==================================================

def get_next_share_code():
    """
    Gets the first row from Google Sheet where completed is empty.
    Apps Script returns:
    {
      success: true,
      row: 2,
      sharecode: "WXN JYE 7FX",
      dob_original: "25/11/2006"
    }
    """

    response = requests.get(
        WEB_APP_URL,
        params={"token": API_TOKEN},
        timeout=30
    )

    data = response.json()

    if not data.get("success"):
        return None, data.get("error", "No pending record found")

    return data, None


def update_sheet_status(row, status="Done", message=""):
    """
    Sends POST request to Apps Script and updates completed column.
    """

    payload = {
        "token": API_TOKEN,
        "row": row,
        "status": status,
        "message": message
    }

    response = requests.post(
        WEB_APP_URL,
        json=payload,
        timeout=30
    )

    return response.json()


# ==================================================
# SELENIUM SETUP
# ==================================================

def create_driver():
    chrome_options = Options()

    prefs = {
        "download.default_directory": str(DOWNLOAD_DIR.resolve()),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True,
        "safebrowsing.enabled": True
    }

    chrome_options.add_experimental_option("prefs", prefs)
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--disable-notifications")

    if HEADLESS:
        chrome_options.add_argument("--headless=new")

    driver = webdriver.Chrome(options=chrome_options)
    return driver


# ==================================================
# HELPER FUNCTIONS
# ==================================================

def safe_person_name_for_filename(value):
    """
    Converts person name into filename format.
    Example:
    VIVEK REDDY TURPU -> Vivek_Reddy_Turpu
    Muhammad Ali -> Muhammad_Ali
    """

    if value is None:
        raise ValueError("Person name is empty")

    text = str(value).strip()

    if not text:
        raise ValueError("Person name is empty")

    # Convert multiple spaces into single underscore
    text = re.sub(r"\s+", "_", text)

    # Remove characters that cannot be used safely in filenames
    text = re.sub(r"[^A-Za-z0-9_\-]", "", text)

    # Clean repeated underscores
    text = re.sub(r"_+", "_", text)

    # Remove unwanted characters from start and end
    text = text.strip("._-")

    if not text:
        raise ValueError("Person name became empty after cleaning")

    # Make GOV.UK uppercase name look cleaner
    return text.title()


def safe_share_code_for_filename(value):
    """
    Converts share code into filename format.
    Example:
    WXN JYE 7FX -> WXNJYE7FX
    """

    if value is None:
        raise ValueError("Share code is empty")

    text = str(value).strip().upper()

    if not text:
        raise ValueError("Share code is empty")

    # Keep only letters and numbers
    text = re.sub(r"[^A-Z0-9]", "", text)

    if not text:
        raise ValueError("Share code became empty after cleaning")

    return text


def normalise_year(year_value):
    """
    Converts 2-digit years safely.
    Example:
    99 -> 1999
    04 -> 2004
    """

    year_text = str(year_value).strip()
    year = int(year_text)

    if len(year_text) == 2:
        year = 1900 + year if year >= 30 else 2000 + year

    return year


def is_valid_date(day, month, year):
    """
    Checks that the day, month, and year make a real calendar date.
    """

    try:
        datetime(int(year), int(month), int(day))
        return True
    except ValueError:
        return False


def format_dob_parts(day, month, year):
    """
    Returns date parts in clean DD/MM/YYYY format.
    Example:
    30-Aug-2002 -> 30/08/2002
    2-May-2002 -> 02/05/2002
    """

    day = int(day)
    month = int(month)
    year = int(year)

    if not is_valid_date(day, month, year):
        raise ValueError(f"Invalid date of birth: {day}/{month}/{year}")

    return f"{day:02d}", f"{month:02d}", str(year)


def parse_date_of_birth(value):
    """
    Parses DOB using DD/MM/YYYY as the main format.

    Supported examples:
    30-Aug-2002
    2-May-2002
    09/10/2004
    09-10-2004
    09.10.2004
    8th Dec 2026
    8 Dec 2026
    08 December 2026
    Dec 8 2026
    2026-12-08
    """

    if value is None:
        raise ValueError("Date of birth is empty")

    raw = str(value).strip()

    if not raw:
        raise ValueError("Date of birth is empty")

    text = raw.strip()

    # Clean common date text
    text = re.sub(r",", " ", text)
    text = re.sub(r"\b(\d{1,2})(st|nd|rd|th)\b", r"\1", text, flags=re.IGNORECASE)

    # IMPORTANT FIX:
    # Converts 2-May-2002 / 30-Aug-2002 into 2 May 2002 / 30 Aug 2002
    text = re.sub(
        r"^(\d{1,2})[-/.]([A-Za-z]+)[-/.](\d{2,4})$",
        r"\1 \2 \3",
        text,
        flags=re.IGNORECASE
    )

    # Converts May-2-2002 / Aug-30-2002 into May 2 2002 / Aug 30 2002
    text = re.sub(
        r"^([A-Za-z]+)[-/.](\d{1,2})[-/.](\d{2,4})$",
        r"\1 \2 \3",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(r"\s+", " ", text).strip()

    months = {
        "jan": 1, "january": 1,
        "feb": 2, "february": 2,
        "mar": 3, "march": 3,
        "apr": 4, "april": 4,
        "may": 5,
        "jun": 6, "june": 6,
        "jul": 7, "july": 7,
        "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10,
        "nov": 11, "november": 11,
        "dec": 12, "december": 12,
    }

    # Format: 2 May 2002 / 30 Aug 2002 / 8 Dec 2026
    match = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$", text)
    if match:
        day = int(match.group(1))
        month_name = match.group(2).lower()
        year = normalise_year(match.group(3))

        if month_name not in months:
            raise ValueError(f"Invalid month name in DOB: {raw}")

        return format_dob_parts(day, months[month_name], year)

    # Format: May 2 2002 / Aug 30 2002 / December 8 2026
    match = re.match(r"^([A-Za-z]+)\s+(\d{1,2})\s+(\d{2,4})$", text)
    if match:
        month_name = match.group(1).lower()
        day = int(match.group(2))
        year = normalise_year(match.group(3))

        if month_name not in months:
            raise ValueError(f"Invalid month name in DOB: {raw}")

        return format_dob_parts(day, months[month_name], year)

    # Format: 2026-12-08 / 2026/12/08 / 2026.12.08
    match = re.match(r"^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$", text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))

        return format_dob_parts(day, month, year)

    # Format: 09/10/2004 / 09-10-2004 / 09.10.2004
    match = re.match(r"^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$", text)
    if match:
        first = int(match.group(1))
        second = int(match.group(2))
        year = normalise_year(match.group(3))

        # Main format: DD/MM/YYYY
        if is_valid_date(first, second, year):
            return format_dob_parts(first, second, year)

        # Fallback for US-style dates like 11/25/2006
        if is_valid_date(second, first, year):
            return format_dob_parts(second, first, year)

        raise ValueError(f"Invalid date of birth: {raw}")

    raise ValueError(f"Unsupported date of birth format: {raw}")
def get_dob_parts_from_record(record):
    """
    Gets DOB from the API record and parses it inside Python.

    Priority:
    1. dob_original from Apps Script
    2. dob / date_of_birth / dateOfBirth, if available in future
    3. Existing day, month, year fields as fallback
    """

    date_candidates = [
        record.get("dob_original"),
        record.get("dob"),
        record.get("date_of_birth"),
        record.get("dateOfBirth"),
    ]

    last_error = None

    for candidate in date_candidates:
        if candidate is None or str(candidate).strip() == "":
            continue

        try:
            return parse_date_of_birth(candidate)
        except ValueError as error:
            last_error = error

    if record.get("day") and record.get("month") and record.get("year"):
        try:
            return format_dob_parts(record["day"], record["month"], record["year"])
        except ValueError as error:
            last_error = error

    if last_error:
        raise ValueError(str(last_error))

    raise ValueError("DOB not found in API response")


def take_screenshot(driver, name):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = SCREENSHOT_DIR / f"{name}_{timestamp}.png"
    driver.save_screenshot(str(file_path))
    logging.info(f"Screenshot saved: {file_path}")


def wait_and_type(wait, by, locator, value):
    element = wait.until(EC.visibility_of_element_located((by, locator)))
    element.clear()
    element.send_keys(str(value))


def wait_and_click(wait, by, locator):
    element = wait.until(EC.element_to_be_clickable((by, locator)))
    element.click()


def get_existing_pdfs():
    return set(DOWNLOAD_DIR.glob("*.pdf"))


def wait_for_new_pdf(existing_pdfs, timeout=90):
    """
    Waits for a new PDF to appear in the download folder.
    """

    end_time = time.time() + timeout

    while time.time() < end_time:
        current_pdfs = set(DOWNLOAD_DIR.glob("*.pdf"))
        new_pdfs = current_pdfs - existing_pdfs

        partial_downloads = list(DOWNLOAD_DIR.glob("*.crdownload"))

        if new_pdfs and not partial_downloads:
            latest_pdf = max(new_pdfs, key=lambda f: f.stat().st_mtime)
            return latest_pdf

        time.sleep(1)

    raise TimeoutError("PDF download did not complete within the timeout.")


def extract_person_name_from_profile(driver, wait):
    """
    Extracts the person name from the GOV.UK Right to Work profile page.

    In the uploaded HTML, the name appears like this:
    <h2 class="govuk-heading-l">VIVEK REDDY TURPU</h2>
    """

    wait.until(EC.url_contains("/rtw-view/profile"))

    selectors = [
        ".rtwr-banner__content .govuk-grid-column-two-thirds h2.govuk-heading-l",
        ".rtwr-banner__content h2.govuk-heading-l",
        "h2.govuk-heading-l"
    ]

    last_error = None

    for selector in selectors:
        try:
            element = wait.until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
            )

            person_name = element.text.strip()

            if person_name:
                logging.info(f"Extracted person name: {person_name}")
                return person_name

        except Exception as error:
            last_error = error

    raise ValueError(f"Could not extract person name from profile page: {last_error}")


def rename_downloaded_pdf(pdf_path, share_code, person_name):
    """
    Saves PDF as:
    Person_Name-sharecode.pdf

    Example:
    Muhammad_Ali-WXNJYE7FX.pdf
    """

    clean_name = safe_person_name_for_filename(person_name)
    clean_code = safe_share_code_for_filename(share_code)

    new_name = f"{clean_name}-{clean_code}.pdf"
    new_path = pdf_path.parent / new_name

    # Keeps the exact required filename format.
    # If the file already exists, it replaces the old one.
    if new_path.exists():
        new_path.unlink()

    shutil.move(str(pdf_path), str(new_path))
    return new_path


# ==================================================
# GOV.UK FLOW FUNCTIONS
# ==================================================

def open_right_to_work_service(driver, wait):
    """
    Opens the official GOV.UK start page and clicks Start now.
    If the button is not found, it opens the service URL directly.
    """

    driver.get(GOV_START_URL)

    try:
        start_button = wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "a.govuk-button"))
        )
        start_button.click()
    except Exception:
        logging.warning("Start now button not found. Opening service URL directly.")
        driver.get(RTW_SERVICE_URL)


def fill_share_code(driver, wait, share_code):
    wait.until(EC.visibility_of_element_located((By.ID, "shareCode")))

    wait_and_type(wait, By.ID, "shareCode", share_code)
    wait_and_click(wait, By.ID, "submit")


def fill_date_of_birth(driver, wait, day, month, year):
    wait.until(EC.visibility_of_element_located((By.ID, "dob-day")))

    wait_and_type(wait, By.ID, "dob-day", day)
    wait_and_type(wait, By.ID, "dob-month", month)
    wait_and_type(wait, By.ID, "dob-year", year)

    wait_and_click(wait, By.ID, "submit")


def fill_company_name(driver, wait, company_name):
    wait.until(EC.visibility_of_element_located((By.ID, "checkerName")))

    wait_and_type(wait, By.ID, "checkerName", company_name)

    wait_and_click(
        wait,
        By.CSS_SELECTOR,
        "input[type='submit'][value='Continue']"
    )


def download_pdf(driver, wait):
    wait.until(EC.url_contains("/rtw-view/profile"))

    existing_pdfs = get_existing_pdfs()

    wait_and_click(
        wait,
        By.CSS_SELECTOR,
        "input[type='submit'][value='Download PDF']"
    )

    downloaded_pdf = wait_for_new_pdf(existing_pdfs)
    return downloaded_pdf


# ==================================================
# SINGLE RECORD PROCESS
# ==================================================

def process_single_record(record):
    row = record["row"]
    share_code = record["sharecode"]

    # DOB is parsed inside Python.
    # Main format is DD/MM/YYYY.
    # It also supports text dates like "8th Dec 2026".
    day, month, year = get_dob_parts_from_record(record)

    driver = create_driver()
    wait = WebDriverWait(driver, 35)

    try:
        logging.info(f"Processing row {row}, share code {share_code}")

        open_right_to_work_service(driver, wait)

        fill_share_code(driver, wait, share_code)

        fill_date_of_birth(driver, wait, day, month, year)

        fill_company_name(driver, wait, COMPANY_NAME)

        # Extract name from the GOV.UK result page before downloading PDF
        person_name = extract_person_name_from_profile(driver, wait)

        downloaded_pdf = download_pdf(driver, wait)

        renamed_pdf = rename_downloaded_pdf(
            downloaded_pdf,
            share_code,
            person_name
        )

        update_response = update_sheet_status(
            row=row,
            status="Done",
            message=f"Downloaded: {renamed_pdf.name}"
        )

        logging.info(f"Row {row} completed.")
        logging.info(f"Person name: {person_name}")
        logging.info(f"PDF: {renamed_pdf}")
        logging.info(f"Sheet update response: {update_response}")

        print(f"Done row {row}")
        print(f"Person Name: {person_name}")
        print(f"PDF: {renamed_pdf.name}")

        return True

    except Exception as error:
        logging.exception(f"Failed row {row}")
        take_screenshot(driver, f"error_row_{row}")

        try:
            update_sheet_status(
                row=row,
                status="Error",
                message=str(error)
            )
        except Exception as post_error:
            logging.exception(f"Could not update error status for row {row}: {post_error}")

        print(f"Failed row {row}: {error}")
        return False

    finally:
        driver.quit()


# ==================================================
# MAIN
# ==================================================

def main():
    print("Right to Work automation started.")

    while True:
        record, error = get_next_share_code()

        if not record:
            print(f"No pending records found: {error}")
            break

        print("Pending record found:")
        print(f"Row: {record['row']}")
        print(f"Share Code: {record['sharecode']}")

        day, month, year = get_dob_parts_from_record(record)
        print(f"DOB: {day}/{month}/{year}")

        process_single_record(record)

        if not PROCESS_ALL_PENDING:
            break

        time.sleep(2)

    print("Right to Work automation finished.")


if __name__ == "__main__":
    main()