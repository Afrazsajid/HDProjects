#!/usr/bin/env python3
"""
Parim User Creator with Google Sheets integration.

This version keeps your working frame-aware Parim Selenium flow, but replaces CSV input with Google Sheets.

Apps Script returns only rows where:
    Parim Completed = blank

Python then:
    - creates the person in Parim
    - opens the created profile URL
    - adds Passport/ID-Card details from the same Google Sheet row
    - writes "Done" back to Parim Completed after profile creation
    - writes notes to Parim Message when optional fields are missing or skipped
    - writes the profile URL back to Parim Profile URL when found
    - writes "Error" only if core profile creation fails

Install:
    pip install selenium requests

Run with environment variables:
    set PARIM_EMAIL=your-parim-login-email
    set PARIM_PASSWORD=your-parim-password
    set PARIM_SHEET_URL=your-apps-script-web-app-url
    set PARIM_API_TOKEN=change-this-token-123

    python parim_user_creator_sheet.py --limit 10 --page-wait 10 --next-form-wait 8 --keep-open
"""

from __future__ import annotations

import argparse
import base64
import csv
import logging
import mimetypes
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile
from urllib.parse import urlparse, unquote

import requests
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException, NoSuchElementException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.webdriver import WebDriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


LOGIN_URL = "https://hd.parim.co/login"
CREATE_USER_URL = "https://hd.parim.co/admin/user/create"
LEGACY_CREATE_USER_URL = "https://hd.parim.co/a/admin/user/create"
DEFAULT_TIMEOUT = 120

ALLOWED_DOCUMENT_EXTENSIONS = {
    # Parim document types shown in the upload tooltip
    ".pdf", ".doc", ".docx", ".txt", ".csv", ".xls", ".xlsx", ".odt", ".ddoc", ".bdoc", ".asice",

    # Added because the OneDrive candidate folders also contain image documents/cards
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
}
MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024


# ==================================================
# DATA HELPERS
# ==================================================

def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalise_key(key: str) -> str:
    key = clean(key)
    key = key.replace("\ufeff", "").replace("\u00a0", " ")
    key = key.lower()
    key = key.replace("/", " ").replace("-", " ")
    key = re.sub(r"[()\[\].,:;]+", " ", key)
    key = re.sub(r"\s+", " ", key)
    return key.strip()


def get(row: dict[str, Any], *names: str, default: str = "") -> str:
    """
    Read a value from a Google Sheet row using tolerant header matching.

    This prevents important fields such as Gender, Nationality and
    NI / Social Security number from being skipped when Google Sheets
    headers contain hidden spaces, NBSP, punctuation or copied formatting.
    """
    normalised = {normalise_key(k): v for k, v in row.items()}

    # First pass: normalised exact match.
    for name in names:
        value = normalised.get(normalise_key(name))
        if value is not None and clean(value) != "":
            return clean(value)

    # Second pass: compact match. Example: "NI Social Security Number"
    # still matches "NI / Social Security number".
    compact = {re.sub(r"\s+", "", k): v for k, v in normalised.items()}
    for name in names:
        key = re.sub(r"\s+", "", normalise_key(name))
        value = compact.get(key)
        if value is not None and clean(value) != "":
            return clean(value)

    return default


def truthy(value: str) -> bool:
    return clean(value).lower() in {"yes", "y", "true", "1", "on", "available", "access", "with car"}


def has_real_value(value: str) -> bool:
    """
    True when a sheet cell has a useful value.

    This avoids treating values like "No", "N/A", "-", or "None" as qualification data.
    Useful for Drivers Licence, where the column may contain either a licence number
    or old values like Yes/No.
    """
    text = clean(value).lower()
    return text not in {"", "no", "n", "false", "0", "none", "n/a", "na", "-", "--"}



def split_multi(value: str) -> list[str]:
    value = clean(value)
    if not value:
        return []
    return [p.strip() for p in re.split(r"[;,|]", value) if p.strip()]


def normalise_phone(value: str) -> str:
    value = clean(value)
    if value.startswith("'"):
        value = value[1:]
    return value.strip()


def normalise_date(value: str) -> str:
    """
    Convert all sheet dates into Parim's required DD/MM/YYYY format.

    Examples:
    - 21st Nov 1999  -> 21/11/1999
    - 05th Nov 2032  -> 05/11/2032
    - 09 Dec 2031    -> 09/12/2031
    - 23rd Jul 1998  -> 23/07/1998
    """
    value = clean(value)
    if not value:
        return ""

    # Remove ordinal suffixes: 21st Nov 1999 -> 21 Nov 1999
    value = re.sub(r"(\d{1,2})(st|nd|rd|th)", r"\1", value, flags=re.IGNORECASE)
    value = value.replace(",", " ")
    value = re.sub(r"\s+", " ", value).strip()

    patterns = (
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y-%m-%d",
        "%d %b %Y",
        "%d %B %Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
    )

    for pattern in patterns:
        try:
            dt = datetime.strptime(value, pattern)
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            pass

    return value



def normalise_country(value: str) -> str:
    value = clean(value)
    if not value:
        return ""

    key = value.replace("\u00a0", " ").lower().strip()
    key = re.sub(r"\s+", " ", key)

    mapping = {
        "united kindom": "United Kingdom",
        "united kingdom": "United Kingdom",
        "uk": "United Kingdom",
        "u.k": "United Kingdom",
        "u.k.": "United Kingdom",
        "england": "United Kingdom",
        "great britain": "United Kingdom",
        "britain": "United Kingdom",
        "pak": "Pakistan",
        "pakistan": "Pakistan",
    }

    return mapping.get(key, value)


def normalise_nationality(value: str) -> str:
    value = clean(value)
    if not value:
        return ""

    key = value.replace("\u00a0", " ").lower().strip()
    key = re.sub(r"\s+", " ", key)

    mapping = {
        "united kindom": "United Kingdom",
        "united kingdom": "United Kingdom",
        "uk": "United Kingdom",
        "u.k": "United Kingdom",
        "u.k.": "United Kingdom",
        "pak": "Pakistani",
        "pakistan": "Pakistani",
    }

    return mapping.get(key, value)

def normalise_sort_code(value: str) -> tuple[str, str, str, str]:
    """
    Convert sheet sort-code values into Parim's 3 separate fields.

    Accepted sheet formats:
    - 00-00-01
    - 00 00 01
    - 000001
    - 00/00/01

    Returns:
    - part1, part2, part3, hidden_combined
    Example:
    - 00-00-01 -> ("00", "00", "01", "000001")
    """
    raw = clean(value)

    if not raw:
        return "", "", "", ""

    digits = re.sub(r"\D", "", raw)

    if len(digits) < 6:
        digits = digits.zfill(6)

    if len(digits) > 6:
        digits = digits[:6]

    part1 = digits[0:2]
    part2 = digits[2:4]
    part3 = digits[4:6]
    return part1, part2, part3, digits


def map_employment_type(value: str) -> str:
    text = clean(value).lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text)

    mapping = {
        "": "Standard",
        "standard": "Standard",
        "full time": "Full-time Employee",
        "fulltime": "Full-time Employee",
        "full time employee": "Full-time Employee",
        "part time": "Part-time Employee",
        "parttime": "Part-time Employee",
        "part time employee": "Part-time Employee",
        "international student": "International Student",
        "part time on vacations": "Part-Time (On Vacations)",
        "part-time on vacations": "Part-Time (On Vacations)",
        "part-time (on vacations)": "Part-Time (On Vacations)",
    }
    return mapping.get(text, value)


def map_gender_to_id(value: str) -> str | None:
    text = clean(value).lower()
    if text.startswith("m"):
        return "UserDetails_gender_0"
    if text.startswith("f"):
        return "UserDetails_gender_1"
    if "non" in text:
        return "UserDetails_gender_2"
    if text in {"undisclosed", "prefer not to say", "unknown"}:
        return "UserDetails_gender_3"
    return None


def normalise_ni_number(value: str) -> str:
    """
    Normalise NI / Social Security number from Google Sheets.

    Keeps the original UK NI pattern, but removes spaces and uppercases letters.
    Example:
    th 01 0243 d -> TH010243D
    """
    value = clean(value)
    if not value:
        return ""
    return re.sub(r"\s+", "", value).upper()


def document_upload_sort_key(path: Path) -> tuple[str, str]:
    """
    Stable upload order for documents.
    Keeps the original file names but uploads in alphabetical order.
    """
    return (path.suffix.lower(), path.name.lower())


def is_allowed_document_file(path: Path) -> tuple[bool, str]:
    """
    Validate files for Parim upload.

    Smart behaviour:
    - Upload every normal document/image file from the OneDrive folder using the same name.
    - Do not skip jpeg/png anymore.
    - Still skip folders, empty files and files over 20 MB.
    - If Parim itself rejects a file type, the upload loop records that file as failed in notes.
    """
    suffix = path.suffix.lower()

    if not suffix:
        return False, "no file extension"

    try:
        size = path.stat().st_size
    except OSError as exc:
        return False, f"cannot read file size: {exc}"

    if size <= 0:
        return False, "empty file"

    if size > MAX_DOCUMENT_SIZE_BYTES:
        return False, f"file over 20 MB ({round(size / 1024 / 1024, 2)} MB)"

    # Allow all extensions listed above, including jpeg/png.
    if suffix in ALLOWED_DOCUMENT_EXTENSIONS:
        return True, ""

    # Still attempt common file types that may be valid business documents.
    # This makes the script upload every useful file rather than skipping too early.
    common_extra = {
        ".rtf", ".ods", ".ppt", ".pptx", ".msg", ".eml"
    }
    if suffix in common_extra:
        return True, ""

    return False, f"unsupported extension {suffix}"


def safe_filename_from_response(url: str, response: requests.Response, fallback: str = "downloaded_file") -> str:
    """Get a safe file name from HTTP headers or URL."""
    cd = response.headers.get("content-disposition", "")

    match = re.search(r'filename\*=UTF-8\'\'([^;]+)', cd, flags=re.IGNORECASE)
    if match:
        name = unquote(match.group(1))
    else:
        match = re.search(r'filename="?([^";]+)"?', cd, flags=re.IGNORECASE)
        name = unquote(match.group(1)) if match else ""

    if not name:
        parsed = urlparse(url)
        name = unquote(Path(parsed.path).name) or fallback

    name = re.sub(r'[<>:"/\\|?*]+', "_", name).strip()
    return name or fallback


def graph_share_id_from_url(shared_url: str) -> str:
    """
    Convert a OneDrive/SharePoint sharing URL to Microsoft share-id format.

    This supports anonymous/shareable links when Microsoft allows access through
    the shares endpoint.
    """
    encoded = base64.urlsafe_b64encode(shared_url.encode("utf-8")).decode("ascii").rstrip("=")
    return "u!" + encoded


def download_file_url(url: str, dest_dir: Path, preferred_name: str = "") -> Path:
    """Download a single file URL to dest_dir and return local path."""
    dest_dir.mkdir(parents=True, exist_ok=True)

    with requests.get(url, stream=True, timeout=120, allow_redirects=True) as response:
        response.raise_for_status()

        name = preferred_name or safe_filename_from_response(url, response)
        path = dest_dir / name

        counter = 1
        original_stem = path.stem
        original_suffix = path.suffix
        while path.exists():
            path = dest_dir / f"{original_stem}_{counter}{original_suffix}"
            counter += 1

        with path.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)

    return path


def try_onedrive_graph_download_folder(folder_url: str, dest_dir: Path) -> list[Path]:
    """
    Download files from a public OneDrive/SharePoint folder link using the
    Microsoft shares endpoint.

    Works when the link is anonymous/shareable and Microsoft exposes
    @microsoft.graph.downloadUrl for files.
    """
    share_id = graph_share_id_from_url(folder_url)
    session = requests.Session()

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
    }

    base_urls = [
        f"https://api.onedrive.com/v1.0/shares/{share_id}/driveItem",
        f"https://graph.microsoft.com/v1.0/shares/{share_id}/driveItem",
    ]

    downloaded: list[Path] = []

    def list_children(api_base: str) -> list[dict[str, Any]]:
        children: list[dict[str, Any]] = []
        url = api_base + "/children"
        while url:
            r = session.get(url, headers=headers, timeout=45)
            r.raise_for_status()
            data = r.json()
            children.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
        return children

    def download_item(api_base: str, item: dict[str, Any], current_dir: Path) -> None:
        name = clean(item.get("name")) or "document"
        if item.get("folder"):
            child_url = f"{api_base}/items/{item.get('id')}/children"
            r = session.get(child_url, headers=headers, timeout=45)
            r.raise_for_status()
            child_data = r.json()
            for child in child_data.get("value", []):
                download_item(api_base, child, current_dir)
            return

        download_url = item.get("@microsoft.graph.downloadUrl")
        if not download_url:
            return

        local_path = download_file_url(download_url, current_dir, preferred_name=name)
        downloaded.append(local_path)

    last_error = None

    for api_base in base_urls:
        try:
            # Check root first, then list children.
            root = session.get(api_base, headers=headers, timeout=45)
            root.raise_for_status()

            children = list_children(api_base)
            for item in children:
                download_item(api_base, item, dest_dir)

            if downloaded:
                return downloaded

        except Exception as exc:
            last_error = exc
            downloaded.clear()
            continue

    if last_error:
        raise RuntimeError(f"OneDrive API folder download failed: {last_error}")

    return downloaded


def try_onedrive_zip_download(folder_url: str, dest_dir: Path) -> list[Path]:
    """
    Fallback for public OneDrive folder links that allow direct ZIP download.

    Many OneDrive folder share links support ?download=1 or &download=1.
    If the response is a ZIP, extract it and return files.
    """
    separator = "&" if "?" in folder_url else "?"
    zip_url = folder_url + separator + "download=1"
    temp_zip = dest_dir / "onedrive_folder_download.zip"

    with requests.get(zip_url, stream=True, timeout=180, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as response:
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").lower()
        if "html" in content_type:
            raise RuntimeError("OneDrive fallback returned an HTML page, not a downloadable ZIP/file.")

        with temp_zip.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)

    downloaded: list[Path] = []

    if zipfile.is_zipfile(temp_zip):
        extract_dir = dest_dir / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(temp_zip, "r") as zf:
            zf.extractall(extract_dir)

        for path in extract_dir.rglob("*"):
            if path.is_file():
                downloaded.append(path)
    else:
        # Link might be a single file instead of folder.
        name = safe_filename_from_response(zip_url, requests.Response(), fallback=temp_zip.name)
        single = dest_dir / name
        temp_zip.rename(single)
        downloaded.append(single)

    return downloaded


def download_onedrive_documents(folder_url: str, dest_root: Path) -> tuple[list[Path], list[str]]:
    """
    Download all valid Parim document files from a OneDrive public/shared folder.

    Returns:
    - valid_files
    - notes for skipped files / download fallback
    """
    notes: list[str] = []
    folder_url = clean(folder_url)

    if not folder_url:
        return [], ["Documents Folder Link missing"]

    temp_dir = dest_root / ("onedrive_docs_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        try:
            downloaded = try_onedrive_graph_download_folder(folder_url, temp_dir)
            notes.append(f"Downloaded {len(downloaded)} file(s) from OneDrive API")
        except Exception as graph_exc:
            notes.append(f"OneDrive API download failed, trying ZIP fallback: {graph_exc}")
            downloaded = try_onedrive_zip_download(folder_url, temp_dir)
            notes.append(f"Downloaded {len(downloaded)} file(s) through OneDrive ZIP/direct fallback")

        valid_files: list[Path] = []
        for path in downloaded:
            if not path.is_file():
                continue

            ok, reason = is_allowed_document_file(path)
            if ok:
                valid_files.append(path)
            else:
                notes.append(f"Skipped document {path.name}: {reason}")

        return valid_files, notes

    except Exception as exc:
        return [], notes + [f"Could not download documents from OneDrive folder: {type(exc).__name__}: {exc}"]



# ==================================================
# RESULT MODEL
# ==================================================

@dataclass
class AutomationResult:
    email: str
    status: str
    profile_url: str = ""
    message: str = ""
    notes: list[str] | None = None


# ==================================================
# SELENIUM BOT
# ==================================================

class ParimUserCreator:
    def __init__(
        self,
        email: str,
        password: str,
        headless: bool = False,
        timeout: int = DEFAULT_TIMEOUT,
        keep_browser_open: bool = False,
        output_dir: str | Path = "output",
        staff_portal_default: bool = False,
        page_wait: int = 7,
        next_form_wait: int = 5,
        profile_wait: int = 5,
        passport_dialog_wait: int = 3,
        bank_dialog_wait: int = 3,
        qualification_dialog_wait: int = 3,
    ) -> None:
        self.login_email = email
        self.login_password = password
        self.timeout = timeout
        self.keep_browser_open = keep_browser_open
        self.staff_portal_default = staff_portal_default
        self.page_wait = page_wait
        self.next_form_wait = next_form_wait
        self.profile_wait = profile_wait
        self.passport_dialog_wait = passport_dialog_wait
        self.bank_dialog_wait = bank_dialog_wait
        self.qualification_dialog_wait = qualification_dialog_wait
        self.step_notes: list[str] = []

        self.output_dir = Path(output_dir)
        self.screenshot_dir = self.output_dir / "screenshots"
        self.debug_dir = self.output_dir / "debug"
        self.document_download_dir = self.output_dir / "document_downloads"
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        self.document_download_dir.mkdir(parents=True, exist_ok=True)

        options = Options()
        options.add_argument("--start-maximized")
        options.add_argument("--disable-notifications")
        options.add_argument("--disable-popup-blocking")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--no-sandbox")
        options.add_experimental_option("excludeSwitches", ["enable-logging"])
        options.add_experimental_option(
            "prefs",
            {
                "download.default_directory": str(self.document_download_dir.resolve()),
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": True,
                "plugins.always_open_pdf_externally": True,
            },
        )

        if headless:
            options.add_argument("--headless=new")
            options.add_argument("--window-size=1600,1200")

        self.driver: WebDriver = webdriver.Chrome(options=options)
        try:
            self.driver.execute_cdp_cmd(
                "Page.setDownloadBehavior",
                {
                    "behavior": "allow",
                    "downloadPath": str(self.document_download_dir.resolve()),
                },
            )
        except Exception:
            logging.warning("Could not set Chrome DevTools download behaviour. Continuing with Chrome preferences.")
        self.wait = WebDriverWait(self.driver, self.timeout)

    def close(self) -> None:
        if not self.keep_browser_open:
            self.driver.quit()

    def add_note(self, message: str) -> None:
        """Add a note that will be written back to the Google Sheet message column."""
        message = clean(message)
        if not message:
            return
        logging.warning("NOTE: %s", message)
        self.step_notes.append(message)

    def run_optional_step(self, step_name: str, func, *args, **kwargs) -> bool:
        """
        Run an optional profile enrichment step.

        If it fails, do not fail the whole row. Add the error to notes and continue.
        This makes the automation smart enough to create the profile even when optional
        data is missing or a later Parim dialog is unavailable.
        """
        try:
            func(*args, **kwargs)
            return True
        except Exception as exc:
            self.save_debug_page("optional_step_failed_" + re.sub(r"[^a-zA-Z0-9_]+", "_", step_name.lower()))
            self.add_note(f"{step_name} skipped/failed: {type(exc).__name__}: {exc}")
            logging.exception("Optional step failed: %s", step_name)
            return False

    # --------------------------------------------------
    # CORE WAIT/FILL HELPERS
    # --------------------------------------------------

    def wait_document_ready(self) -> None:
        self.wait.until(lambda d: d.execute_script("return document.readyState") in ("interactive", "complete"))

    def save_debug_page(self, name: str) -> None:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_path = self.debug_dir / f"{name}_{stamp}.html"
        png_path = self.debug_dir / f"{name}_{stamp}.png"

        try:
            html_path.write_text(self.driver.page_source, encoding="utf-8")
        except Exception:
            pass

        try:
            self.driver.save_screenshot(str(png_path))
        except Exception:
            pass

    def switch_to_context_with_id(self, element_id: str):
        """
        Find an element by ID in the main page or inside iframe/frame elements.
        If found inside a frame, Selenium stays switched into that frame so
        subsequent fill/click commands work in the right DOM context.
        """
        self.driver.switch_to.default_content()
        return self._search_id_in_current_context(element_id, path="top", depth=0)

    def _search_id_in_current_context(self, element_id: str, path: str, depth: int):
        elements = self.driver.find_elements(By.ID, element_id)
        if elements:
            logging.info("Found #%s in context: %s", element_id, path)
            try:
                self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", elements[0])
            except Exception:
                pass
            return elements[0]

        if depth >= 4:
            return None

        frames = self.driver.find_elements(By.CSS_SELECTOR, "iframe, frame")

        for index, frame in enumerate(frames):
            try:
                self.driver.switch_to.frame(frame)
                found = self._search_id_in_current_context(
                    element_id,
                    path=f"{path} > frame[{index}]",
                    depth=depth + 1,
                )
                if found:
                    return found
                self.driver.switch_to.parent_frame()
            except Exception:
                try:
                    self.driver.switch_to.parent_frame()
                except Exception:
                    self.driver.switch_to.default_content()

        return None

    def page_debug_summary(self) -> str:
        """Small readable summary for logs when the expected field is missing."""
        try:
            self.driver.switch_to.default_content()
        except Exception:
            pass

        try:
            frame_count = len(self.driver.find_elements(By.CSS_SELECTOR, "iframe, frame"))
        except Exception:
            frame_count = 0

        try:
            body_text = self.driver.execute_script(
                "return (document.body && document.body.innerText || '').slice(0, 700);"
            )
        except Exception:
            body_text = ""

        title = ""
        try:
            title = self.driver.title
        except Exception:
            pass

        return (
            f"current_url={self.driver.current_url} | "
            f"title={title!r} | "
            f"frames={frame_count} | "
            f"body_start={body_text!r}"
        )

    def wait_for_id(self, element_id: str, label: str | None = None):
        label = label or element_id
        logging.info("Waiting for field: %s", label)

        try:
            element = self.wait.until(lambda _d: self.switch_to_context_with_id(element_id))
            return element
        except TimeoutException:
            summary = self.page_debug_summary()
            logging.error("Could not find #%s. Page summary: %s", element_id, summary)
            self.save_debug_page(f"missing_{element_id}")
            raise TimeoutException(
                f"Could not find field #{element_id}. {summary}. "
                "Saved debug HTML and screenshot in output/debug."
            )

    def try_wait_for_id_short(self, element_id: str, seconds: int = 8):
        try:
            return WebDriverWait(self.driver, seconds).until(
                lambda _d: self.switch_to_context_with_id(element_id)
            )
        except TimeoutException:
            return None

    def fill_by_id(self, element_id: str, value: str, required: bool = False) -> None:
        value = clean(value)

        if value == "" and not required:
            logging.info("Skipped empty field: %s", element_id)
            return

        element = self.wait_for_id(element_id)

        # First try normal Selenium, then force JS. Some Parim fields accept only one method reliably.
        try:
            element.clear()
            element.send_keys(value)
        except Exception:
            pass

        result = self.driver.execute_script(
            """
            const id = arguments[0];
            const value = arguments[1];
            const el = document.getElementById(id);

            if (!el) {
                return {ok:false, message:'Element not found: #' + id};
            }

            el.scrollIntoView({block:'center', inline:'nearest'});
            el.removeAttribute('readonly');
            el.removeAttribute('disabled');
            el.focus();

            const tag = (el.tagName || '').toLowerCase();

            if (tag === 'input' || tag === 'textarea') {
                const proto = tag === 'textarea'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;

                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

                if (setter) {
                    setter.call(el, value);
                } else {
                    el.value = value;
                }
            } else {
                el.value = value;
            }

            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));

            return {
                ok:true,
                value:el.value,
                visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
            };
            """,
            element_id,
            value,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not fill #{element_id}"))

        # Verify value actually landed.
        actual = clean(self.driver.execute_script("return document.getElementById(arguments[0]).value;", element_id))
        if value and actual != value:
            raise RuntimeError(f"Field #{element_id} did not keep value. Expected '{value}', got '{actual}'.")

        logging.info("Filled %s = %s", element_id, value)

    def select_by_id(self, element_id: str, visible_text: str = "", value: str = "", required: bool = False) -> None:
        visible_text = clean(visible_text)
        value = clean(value)

        if not visible_text and not value and not required:
            logging.info("Skipped empty select: %s", element_id)
            return

        element = self.wait_for_id(element_id)

        try:
            select = Select(element)
            if value:
                select.select_by_value(value)
            else:
                # Try exact visible text first.
                try:
                    select.select_by_visible_text(visible_text)
                except NoSuchElementException:
                    wanted = visible_text.lower()
                    matched = False
                    for option in select.options:
                        option_text = clean(option.text)
                        option_lower = option_text.lower()
                        if option_lower == wanted or wanted in option_lower or option_lower in wanted:
                            select.select_by_visible_text(option_text)
                            matched = True
                            break
                    if not matched:
                        raise
        except Exception:
            # JavaScript fallback.
            result = self.driver.execute_script(
                """
                const id = arguments[0];
                const wantedText = (arguments[1] || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                const wantedValue = (arguments[2] || '').trim();

                const select = document.getElementById(id);
                if (!select) return {ok:false, message:'Select not found: #' + id};

                const options = Array.from(select.options || []);
                let option = null;

                if (wantedValue) {
                    option = options.find(o => String(o.value).trim() === wantedValue);
                }

                if (!option && wantedText) {
                    option = options.find(o => (o.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === wantedText);
                }

                if (!option && wantedText) {
                    option = options.find(o => {
                        const t = (o.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                        return t.includes(wantedText) || wantedText.includes(t);
                    });
                }

                if (!option) {
                    return {
                        ok:false,
                        message:'Option not found in #' + id + ': ' + (wantedText || wantedValue),
                        options: options.map(o => o.textContent.trim()).join(' | ')
                    };
                }

                select.value = option.value;
                select.dispatchEvent(new Event('input', {bubbles:true}));
                select.dispatchEvent(new Event('change', {bubbles:true}));
                select.dispatchEvent(new Event('blur', {bubbles:true}));

                return {ok:true, value:select.value, text:option.textContent.trim()};
                """,
                element_id,
                visible_text,
                value,
            )

            if not result or not result.get("ok"):
                raise RuntimeError(result.get("message", f"Could not select #{element_id}"))

        selected_text = self.driver.execute_script(
            """
            const s = document.getElementById(arguments[0]);
            if (!s || s.selectedIndex < 0) return '';
            return s.options[s.selectedIndex].textContent.trim();
            """,
            element_id,
        )
        logging.info("Selected %s = %s", element_id, selected_text)

    def click_by_id(self, element_id: str) -> None:
        element = self.wait_for_id(element_id)
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
        try:
            element.click()
        except Exception:
            self.driver.execute_script("arguments[0].click();", element)
        logging.info("Clicked %s", element_id)

    def click_submit_in_form(self, form_id: str, text_contains: str = "Save") -> None:
        self.wait_for_id(form_id)

        result = self.driver.execute_script(
            """
            const formId = arguments[0];
            const text = (arguments[1] || '').toLowerCase();
            const form = document.getElementById(formId);

            if (!form) {
                return {ok:false, message:'Form not found: #' + formId};
            }

            const buttons = Array.from(form.querySelectorAll('input[type="submit"], button[type="submit"]'));

            const btn = buttons.find(b => ((b.value || b.textContent || '').toLowerCase()).includes(text))
                || buttons.find(b => ((b.value || b.textContent || '').toLowerCase()).includes('save'));

            if (!btn) {
                return {ok:false, message:'Submit button not found in #' + formId};
            }

            btn.scrollIntoView({block:'center', inline:'nearest'});
            btn.click();

            return {ok:true, text: btn.value || btn.textContent || ''};
            """,
            form_id,
            text_contains,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not submit form #{form_id}"))

        logging.info("Clicked submit: %s", result.get("text"))

    def get_visible_errors(self) -> str:
        return clean(
            self.driver.execute_script(
                """
                const errors = Array.from(document.querySelectorAll('.errorMessage, [role="alert"]'));
                return errors
                    .filter(e => {
                        const txt = (e.textContent || '').trim();
                        if (!txt) return false;
                        const st = window.getComputedStyle(e);
                        return st.display !== 'none' && st.visibility !== 'hidden';
                    })
                    .map(e => e.textContent.trim())
                    .join(' | ');
                """
            )
        )

    def wait_after_submit_for_field(self, next_field_id: str, step_name: str) -> None:
        logging.info("Waiting for next step: %s", step_name)

        def condition(_driver):
            # Important fix:
            # Parim loads the create flow inside frame[0]. Selenium can find the next
            # field there, but Parim's old CSS sometimes still reports a hidden parent
            # during the transition. Earlier code kept waiting even though the field
            # existed. Now we accept the field as soon as it exists and keep Selenium
            # switched inside the frame where it was found.
            element = self.switch_to_context_with_id(next_field_id)
            if element:
                return True

            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page(f"timeout_waiting_{next_field_id}")
            summary = self.page_debug_summary()
            raise TimeoutException(
                f"Timeout waiting for {step_name}. {summary}. "
                "Saved debug files in output/debug."
            )

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

        logging.info("%s field is present and Selenium is in the correct frame", step_name)

    # --------------------------------------------------
    # LOGIN
    # --------------------------------------------------

    def login(self) -> None:
        logging.info("Opening login page")
        self.driver.get(LOGIN_URL)
        self.wait_document_ready()
        time.sleep(1)

        # Already logged in case.
        if not self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="email-test"]'):
            logging.info("Login form not visible. Assuming already logged in.")
            return

        email_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="email-test"]')))
        password_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="password"]')))

        email_input.clear()
        email_input.send_keys(self.login_email)

        password_input.clear()
        password_input.send_keys(self.login_password)

        submit = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="submit-button"]')))

        self.wait.until(lambda d: d.execute_script(
            "const b=document.querySelector('[data-testid=\"submit-button\"]'); return b && !b.disabled;"
        ))

        self.driver.execute_script("arguments[0].click();", submit)

        try:
            self.wait.until(lambda d: "/login" not in d.current_url.lower())
        except TimeoutException:
            self.save_debug_page("login_failed")
            raise RuntimeError("Login did not complete. Check login details, CAPTCHA, 2FA, or permissions.")

        logging.info("Login successful. Current URL: %s", self.driver.current_url)

    # --------------------------------------------------
    # CREATE USER FLOW
    # --------------------------------------------------

    def open_create_page(self) -> None:
        logging.info("Opening create user URL")

        urls_to_try = [
            CREATE_USER_URL,
            LEGACY_CREATE_USER_URL,
        ]

        last_summary = ""

        for url in urls_to_try:
            logging.info("Trying create URL: %s", url)
            self.driver.switch_to.default_content()
            self.driver.get(url)
            self.wait_document_ready()

            logging.info("Waiting %s seconds for create form to appear", self.page_wait)
            time.sleep(self.page_wait)

            last_summary = self.page_debug_summary()
            logging.info("After opening URL page summary: %s", last_summary)

            first_name = self.try_wait_for_id_short("UserDetails_first_name", seconds=8)
            if first_name:
                logging.info("Create user form found at: %s", self.driver.current_url)

                # Verify the required first-page fields are available in the same context/frame.
                self.wait_for_id("UserDetails_first_name", "First Name")
                self.wait_for_id("UserDetails_last_name", "Last Name")
                self.wait_for_id("User_email", "Email")
                self.wait_for_id("UserContract_contract_type_id", "Employment Type")

                logging.info("Create user form is ready. Starting fill.")
                return

            logging.warning("Create form not found at %s", url)
            self.save_debug_page("create_form_not_found")

        raise TimeoutException(
            "Could not find the create-user form in /admin/user/create or /a/admin/user/create. "
            f"Last page summary: {last_summary}. "
            "Open output/debug HTML or screenshot to see what Parim actually loaded."
        )

    def fill_person_details(self, row: dict[str, Any]) -> None:
        logging.info("Filling Person's Details")

        first_name = get(row, "First Name (compulsory)", "First Name")
        last_name = get(row, "Last Name (compulsory)", "Last Name")
        person_email = get(row, "Email Address (compulsory)", "Email", "Email Address")

        self.fill_by_id("UserDetails_first_name", first_name, required=True)
        self.fill_by_id("UserDetails_last_name", last_name, required=True)
        self.fill_by_id("User_email", person_email, required=True)

        employment = map_employment_type(get(row, "Employment Type", default="Standard"))
        self.select_by_id("UserContract_contract_type_id", visible_text=employment, required=True)

        self.fill_by_id("UserContract_contract_no", get(row, "Contract No"))
        self.fill_by_id("user_edit_start_date", normalise_date(get(row, "Contract Start", "Contract start", "Start Date")))
        self.fill_by_id("user_edit_end_date", normalise_date(get(row, "Contract End", "Contract end", "End Date", "Contract Finish")))

        for department in split_multi(get(row, "Department")):
            if self.check_label_checkbox("UserToDepartment[]", department):
                logging.info("Selected department: %s", department)
            else:
                logging.warning("Department not found on form: %s", department)

        for position in split_multi(get(row, "Position", "Job Title")):
            if self.check_label_checkbox("UserToPosition[]", position):
                logging.info("Selected position: %s", position)
            else:
                logging.warning("Position not found on form: %s", position)

        access_value = get(row, "Give access to the Staff Portal", "Staff Portal Access")
        give_access = truthy(access_value) if access_value else self.staff_portal_default
        self.set_staff_portal_access(give_access)

        self.click_submit_in_form("user-create-form", "Save")
        self.wait_for_contacts_form_ready()

    def check_label_checkbox(self, checkbox_name: str, label_text: str) -> bool:
        label_text = clean(label_text)
        if not label_text:
            return False

        result = self.driver.execute_script(
            """
            const checkboxName = arguments[0];
            const target = arguments[1].replace(/\\s+/g, ' ').trim().toLowerCase();
            const boxes = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${checkboxName}"]`));

            for (const box of boxes) {
                const holder = box.closest('a') || box.parentElement;
                const text = (holder ? holder.innerText : '').replace(/\\s+/g, ' ').trim().toLowerCase();

                if (text === target || text.includes(target) || target.includes(text)) {
                    box.scrollIntoView({block:'center', inline:'nearest'});
                    box.checked = true;
                    box.dispatchEvent(new Event('input', {bubbles:true}));
                    box.dispatchEvent(new Event('change', {bubbles:true}));
                    return {ok:true, text:text};
                }
            }

            return {ok:false};
            """,
            checkbox_name,
            label_text,
        )

        return bool(result and result.get("ok"))

    def set_staff_portal_access(self, wanted: bool) -> None:
        result = self.driver.execute_script(
            """
            const box = document.querySelector('input[name="give_access"]');
            if (!box) return {ok:false};

            box.checked = Boolean(arguments[0]);
            box.dispatchEvent(new Event('input', {bubbles:true}));
            box.dispatchEvent(new Event('change', {bubbles:true}));

            const wrap = box.closest('.switch-animate');
            if (wrap) {
                wrap.classList.toggle('switch-on', Boolean(arguments[0]));
                wrap.classList.toggle('switch-off', !Boolean(arguments[0]));
            }

            return {ok:true, checked:box.checked};
            """,
            wanted,
        )

        if result and result.get("ok"):
            logging.info("Staff Portal access set to: %s", result.get("checked"))

    def wait_for_contacts_form_ready(self) -> None:
        """
        After the first Person's Details form is submitted, Parim reveals the Contacts
        form on the same page. This dedicated wait handles that AJAX/section switch.
        """
        logging.info("Waiting %s seconds for Contacts form to appear", self.next_form_wait)
        time.sleep(self.next_form_wait)

        # The uploaded contacts form has id='user-contacts-form' and starts with
        # the Mobile input id='UserDetails_phone'.
        self.wait_after_submit_for_field("UserDetails_phone", "Contacts form")

        # Confirm the actual contacts form exists in the current frame/context.
        # These waits also leave Selenium inside the correct frame for filling.
        self.wait_for_id("user-contacts-form", "Contacts form")
        self.wait_for_id("UserDetails_phone", "Mobile")

        logging.info("Contacts form is ready and active")

    def fill_contacts(self, row: dict[str, Any]) -> None:
        logging.info("Filling Contacts")

        # Safety check in case this method is called directly or the page takes extra time.
        self.wait_for_id("user-contacts-form", "Contacts form")
        self.wait_for_id("UserDetails_phone", "Mobile")

        self.fill_by_id("UserDetails_phone", normalise_phone(get(row, "Mobile (enter ' then 0.)", "Mobile", "Phone")))
        self.fill_by_id("UserAddress_address_line", get(row, "Street Name", "Address Line", "Street"))
        self.fill_by_id("UserAddress_apartment_number", get(row, "Apartment No", "Apartment no"))
        self.fill_by_id("UserAddress_house_number", get(row, "House No", "House no"))
        self.fill_by_id("UserAddress_postcode", get(row, "Postcode", "Postal Code"))
        self.fill_by_id("UserAddress_city", get(row, "City/ Town", "City", "Town"))

        address_country = normalise_country(get(row, "Country", default="United Kingdom") or "United Kingdom")
        self.select_by_id("UserAddress_country_id", visible_text=address_country)

        self.click_submit_in_form("user-contacts-form", "Save")
        self.wait_after_submit_for_field("UserDetails_date_of_birth", "Personal Details form")

    def set_gender_field(self, gender: str) -> None:
        """
        Robustly set gender on the Personal Details form.

        First tries Parim's known radio IDs:
        - Male        = UserDetails_gender_0
        - Female      = UserDetails_gender_1
        - Non-binary  = UserDetails_gender_2
        - Undisclosed = UserDetails_gender_3

        Then falls back to all radio inputs that contain gender in their name/id.
        """
        gender = clean(gender)
        if not gender:
            logging.info("Skipped empty Gender")
            return

        wanted = gender.lower().strip()

        result = self.driver.execute_script(
            """
            const wanted = (arguments[0] || '').trim().toLowerCase();

            function visibleText(el) {
                const label = el.closest('label');
                const parent = el.parentElement;
                const row = el.closest('.row, .row-fluid, dd, div');
                return [
                    label ? label.innerText : '',
                    parent ? parent.innerText : '',
                    row ? row.innerText : '',
                    el.value || '',
                    el.id || '',
                    el.name || ''
                ].join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
            }

            function clickRadio(el) {
                el.scrollIntoView({block:'center', inline:'nearest'});
                el.removeAttribute('disabled');
                el.checked = true;
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.click();
                return {ok:true, id:el.id || '', value:el.value || '', checked:el.checked};
            }

            let id = '';
            if (wanted.startsWith('m')) id = 'UserDetails_gender_0';
            else if (wanted.startsWith('f')) id = 'UserDetails_gender_1';
            else if (wanted.includes('non')) id = 'UserDetails_gender_2';
            else if (wanted.includes('undisclosed') || wanted.includes('prefer') || wanted.includes('unknown')) id = 'UserDetails_gender_3';

            if (id) {
                const byId = document.getElementById(id);
                if (byId) return clickRadio(byId);
            }

            const radios = Array.from(document.querySelectorAll(
                'input[type="radio"][name*="gender" i], input[type="radio"][id*="gender" i]'
            ));

            for (const radio of radios) {
                const text = visibleText(radio);

                if (
                    (wanted.startsWith('m') && (text.includes('male') || radio.value === '0')) ||
                    (wanted.startsWith('f') && (text.includes('female') || radio.value === '1')) ||
                    (wanted.includes('non') && text.includes('non')) ||
                    ((wanted.includes('undisclosed') || wanted.includes('prefer') || wanted.includes('unknown')) && (text.includes('undisclosed') || text.includes('unknown') || text.includes('prefer')))
                ) {
                    return clickRadio(radio);
                }
            }

            return {
                ok:false,
                message:'Could not find gender radio for: ' + wanted,
                radios: radios.map(r => (r.id || r.name || r.value || '')).join(' | ')
            };
            """,
            gender,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not set Gender: {gender}"))

        logging.info("Selected Gender = %s via id=%s value=%s", gender, result.get("id"), result.get("value"))

    def set_nationality_field(self, nationality: str) -> None:
        """
        Robustly fill Nationality on the Personal Details form.
        Handles both text input and select-style Parim fields.
        """
        nationality = clean(nationality)
        if not nationality:
            logging.info("Skipped empty Nationality")
            return

        result = self.driver.execute_script(
            """
            const value = arguments[0];

            const selectors = [
                '#UserDetails_nationality',
                'input[name="UserDetails[nationality]"]',
                'select[name="UserDetails[nationality]"]',
                '#UserDetails_nationality_id',
                'select[name="UserDetails[nationality_id]"]',
                'input[id*="nationality" i]',
                'select[id*="nationality" i]'
            ];

            let el = null;
            let selectorUsed = '';

            for (const selector of selectors) {
                el = document.querySelector(selector);
                if (el) {
                    selectorUsed = selector;
                    break;
                }
            }

            if (!el) {
                return {ok:false, message:'Nationality field not found'};
            }

            el.scrollIntoView({block:'center', inline:'nearest'});
            el.removeAttribute('readonly');
            el.removeAttribute('disabled');
            el.focus();

            const tag = (el.tagName || '').toLowerCase();

            if (tag === 'select') {
                const wanted = String(value).replace(/\\s+/g, ' ').trim().toLowerCase();
                const options = Array.from(el.options || []);
                let option = options.find(o => (o.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === wanted);
                if (!option) {
                    option = options.find(o => {
                        const t = (o.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                        return t.includes(wanted) || wanted.includes(t);
                    });
                }
                if (!option) {
                    return {ok:false, message:'Nationality option not found: ' + value};
                }
                el.value = option.value;
            } else {
                const proto = window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (setter) setter.call(el, value);
                else el.value = value;
            }

            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));

            return {ok:true, selector:selectorUsed, value:el.value};
            """,
            nationality,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not fill Nationality: {nationality}"))

        logging.info("Filled Nationality via %s = %s", result.get("selector"), nationality)

    def set_ni_number_field(self, ni_number: str) -> None:
        """
        Robustly fill NI / Social Security number on the Personal Details form.
        """
        ni_number = normalise_ni_number(ni_number)
        if not ni_number:
            logging.info("Skipped empty NI / Social Security number")
            return

        result = self.driver.execute_script(
            """
            const value = arguments[0];

            const selectors = [
                '#UserDetails_nin',
                'input[name="UserDetails[nin]"]',
                '#UserDetails_ni',
                'input[name="UserDetails[ni]"]',
                '#UserDetails_national_insurance_number',
                'input[name="UserDetails[national_insurance_number]"]',
                'input[id*="nin" i]',
                'input[name*="nin" i]',
                'input[id*="insurance" i]',
                'input[name*="insurance" i]',
                'input[id*="social" i]',
                'input[name*="social" i]'
            ];

            let el = null;
            let selectorUsed = '';

            for (const selector of selectors) {
                el = document.querySelector(selector);
                if (el) {
                    selectorUsed = selector;
                    break;
                }
            }

            if (!el) {
                return {ok:false, message:'NI / Social Security number field not found'};
            }

            el.scrollIntoView({block:'center', inline:'nearest'});
            el.removeAttribute('readonly');
            el.removeAttribute('disabled');
            el.focus();

            const proto = window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            if (setter) setter.call(el, value);
            else el.value = value;

            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));

            return {ok:true, selector:selectorUsed, value:el.value};
            """,
            ni_number,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not fill NI / Social Security number: {ni_number}"))

        actual = clean(result.get("value", "")).upper().replace(" ", "")
        if actual != ni_number:
            raise RuntimeError(f"NI Number did not keep value. Expected '{ni_number}', got '{actual}'.")

        logging.info("Filled NI / Social Security number via %s = %s", result.get("selector"), ni_number)

    def verify_personal_details_before_submit(self, row: dict[str, Any]) -> None:
        """
        Extra safety check before clicking Save on Personal Details.
        If Gender, Nationality, or NI are present in the sheet but not in the form,
        this throws a clear error instead of silently creating an incomplete profile.
        """
        expected_gender = clean(get(row, "Gender"))
        expected_nationality = clean(get(row, "Nationality"))
        expected_ni = normalise_ni_number(get(row, "NI / Social Security number", "NI no", "National Insurance Number"))

        result = self.driver.execute_script(
            """
            const expectedGender = arguments[0];
            const expectedNationality = arguments[1];
            const expectedNi = arguments[2];

            const errors = [];

            if (expectedGender) {
                const checkedGender = document.querySelector(
                    'input[type="radio"][name*="gender" i]:checked, input[type="radio"][id*="gender" i]:checked'
                );
                if (!checkedGender) errors.push('Gender was not selected');
            }

            if (expectedNationality) {
                const nationalityEl = document.querySelector(
                    '#UserDetails_nationality, input[name="UserDetails[nationality]"], select[name="UserDetails[nationality]"], #UserDetails_nationality_id, select[name="UserDetails[nationality_id]"], input[id*="nationality" i], select[id*="nationality" i]'
                );
                if (!nationalityEl || !String(nationalityEl.value || '').trim()) {
                    errors.push('Nationality was not filled');
                }
            }

            if (expectedNi) {
                const niEl = document.querySelector(
                    '#UserDetails_nin, input[name="UserDetails[nin]"], #UserDetails_ni, input[name="UserDetails[ni]"], #UserDetails_national_insurance_number, input[name="UserDetails[national_insurance_number]"], input[id*="nin" i], input[name*="nin" i], input[id*="insurance" i], input[name*="insurance" i], input[id*="social" i], input[name*="social" i]'
                );
                const actual = niEl ? String(niEl.value || '').replace(/\\s+/g, '').toUpperCase() : '';
                if (!actual || actual !== expectedNi) {
                    errors.push('NI Number was not filled correctly. Actual: ' + actual);
                }
            }

            return {ok: errors.length === 0, errors};
            """,
            expected_gender,
            expected_nationality,
            expected_ni,
        )

        if not result or not result.get("ok"):
            raise RuntimeError("Personal Details verification failed: " + " | ".join(result.get("errors", [])))

        logging.info("Verified Personal Details before submit: Gender, Nationality and NI Number")

    def validate_core_sheet_values(self, row: dict[str, Any]) -> None:
        """
        Soft validation for core personal details.

        Old behaviour:
        - If Gender, Nationality or NI Number were missing, the whole row failed.

        New smart behaviour:
        - If any of these are missing, continue the profile creation.
        - Add notes to the Google Sheet message so you can fix the row later.
        """
        gender = get(row, "Gender")
        nationality = get(row, "Nationality")
        ni_number = get(row, "NI / Social Security number", "NI no", "National Insurance Number")

        missing = []
        if not clean(gender):
            missing.append("Gender")
        if not clean(nationality):
            missing.append("Nationality")
        if not clean(ni_number):
            missing.append("NI / Social Security number")

        if missing:
            self.add_note("Missing optional personal detail(s): " + ", ".join(missing))
        else:
            logging.info(
                "Core values from sheet | Gender=%s | Nationality=%s | NI=%s",
                gender,
                nationality,
                normalise_ni_number(ni_number),
            )

    def click_real_personal_details_save(self) -> None:
        """
        Click the real Personal Details Save / Save & Next button.

        Fix:
        Parim sometimes places the positive button outside #user-details-form,
        or labels it as Save & Next / Save and Next. This method searches both
        inside the form and around the full page, blocks Skip for later, then clicks
        only the real positive button.

        It also fires input/change/blur events one final time before clicking.
        """
        self.wait_for_id("user-details-form", "Personal Details form")

        result = self.driver.execute_script(
            """
            const form = document.getElementById('user-details-form');
            if (!form) return {ok:false, message:'Personal Details form not found'};

            function labelOf(el) {
                return String(el.value || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '')
                    .replace(/\\s+/g, ' ')
                    .trim();
            }

            function isVisible(el) {
                if (!el) return false;
                const st = window.getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' &&
                    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            }

            function fire(el) {
                if (!el) return;
                el.removeAttribute('readonly');
                el.removeAttribute('disabled');
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
                el.dispatchEvent(new Event('blur', {bubbles:true}));
            }

            // Final event fire before Save.
            [
                '#UserDetails_date_of_birth',
                '#UserDetails_nationality',
                '#UserDetails_nin',
                '#UserDetails_birth_country_id',
                '#UserDetails_city_of_birth',
                '#UserDetails_drivers_license',
                '#UserDetails_visa_needed',
                '#UserVisaDetails_visa_description',
                '#UserVisaDetails_expiry_date'
            ].forEach(sel => fire(document.querySelector(sel)));

            const checkedGender = document.querySelector(
                'input[type="radio"][name*="gender" i]:checked, input[type="radio"][id*="gender" i]:checked'
            );
            fire(checkedGender);

            const allCandidates = Array.from(document.querySelectorAll(
                'input[type="submit"], button[type="submit"], input[type="button"], button, a.btn, a[class*="btn"], .btn'
            ));

            // Prefer candidates inside form, but also allow buttons outside form because Parim sometimes renders them outside.
            const formCandidates = allCandidates.filter(el => form.contains(el));
            const nearbyCandidates = allCandidates.filter(el => {
                const txt = labelOf(el).toLowerCase();
                return /save|next|create|finish/i.test(txt);
            });

            const candidates = [...formCandidates, ...nearbyCandidates]
                .filter((el, index, arr) => arr.indexOf(el) === index)
                .filter(isVisible);

            const blocked = candidates
                .map(labelOf)
                .filter(x => /skip|later|cancel|back|close/i.test(x));

            function isSafePositive(el) {
                const label = labelOf(el).toLowerCase();
                if (!label) return false;
                if (/skip|later|cancel|back|close/i.test(label)) return false;
                return /save|save\s*&\s*next|save\s*and\s*next|next|finish|create/i.test(label);
            }

            // Strong preference: Save & Next / Save and Next.
            let saveBtn = candidates.find(el => {
                const label = labelOf(el).toLowerCase();
                return /save\s*&\s*next|save\s*and\s*next/i.test(label) && !/skip|later|cancel|back|close/i.test(label);
            });

            // Second preference: any safe Save button.
            if (!saveBtn) {
                saveBtn = candidates.find(el => {
                    const label = labelOf(el).toLowerCase();
                    return /save/i.test(label) && !/skip|later|cancel|back|close/i.test(label);
                });
            }

            // Third preference: safe Next / Finish button.
            if (!saveBtn) {
                saveBtn = candidates.find(isSafePositive);
            }

            if (!saveBtn) {
                return {
                    ok:false,
                    message:'Real Save / Save & Next button not found on Personal Details. Visible buttons: ' +
                        candidates.map(labelOf).join(' | ')
                };
            }

            const clickedText = labelOf(saveBtn);
            saveBtn.scrollIntoView({block:'center', inline:'nearest'});
            saveBtn.focus();

            // Use native click first.
            saveBtn.click();

            return {
                ok:true,
                clickedText,
                blocked:blocked.join(' | '),
                allVisibleButtons:candidates.map(labelOf).join(' | ')
            };
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click real Personal Details Save / Save & Next button"))

        logging.info(
            "Clicked real Personal Details button: %s | blocked: %s | visible buttons: %s",
            result.get("clickedText"),
            result.get("blocked") or "none",
            result.get("allVisibleButtons") or "",
        )

        # Give Parim time to leave the Personal Details page after Save & Next.
        time.sleep(2)

        errors = self.get_visible_errors()
        if errors:
            raise RuntimeError(f"Personal Details save failed after clicking Save / Save & Next: {errors}")

    def stabilise_personal_core_fields(self, row: dict[str, Any], wait_seconds: float = 3.0) -> None:
        """
        Pause after filling Gender, Nationality and NI Number so Parim's old
        JavaScript form handlers have time to register the values before Save.

        This is important because Parim may visually show the values, but if Save is
        clicked too quickly the backend can still receive blank Gender/Nationality/NI.
        """
        expected_gender = clean(get(row, "Gender"))
        expected_nationality = normalise_nationality(get(row, "Nationality"))
        expected_ni = normalise_ni_number(get(row, "NI / Social Security number", "NI no", "National Insurance Number"))

        logging.info(
            "Waiting %.1f seconds after core Personal Details fields. Gender=%s | Nationality=%s | NI=%s",
            wait_seconds,
            expected_gender,
            expected_nationality,
            expected_ni,
        )

        result = self.driver.execute_script(
            """
            const expectedGender = arguments[0];
            const expectedNationality = arguments[1];
            const expectedNi = arguments[2];

            function fire(el) {
                if (!el) return;
                el.scrollIntoView({block:'center', inline:'nearest'});
                el.focus();
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
                el.dispatchEvent(new Event('blur', {bubbles:true}));
            }

            const checkedGender = document.querySelector(
                'input[type="radio"][name*="gender" i]:checked, input[type="radio"][id*="gender" i]:checked'
            );
            fire(checkedGender);

            const nationalityEl = document.querySelector(
                '#UserDetails_nationality, input[name="UserDetails[nationality]"], select[name="UserDetails[nationality]"], #UserDetails_nationality_id, select[name="UserDetails[nationality_id]"], input[id*="nationality" i], select[id*="nationality" i]'
            );
            fire(nationalityEl);

            const niEl = document.querySelector(
                '#UserDetails_nin, input[name="UserDetails[nin]"], #UserDetails_ni, input[name="UserDetails[ni]"], #UserDetails_national_insurance_number, input[name="UserDetails[national_insurance_number]"], input[id*="nin" i], input[name*="nin" i], input[id*="insurance" i], input[name*="insurance" i], input[id*="social" i], input[name*="social" i]'
            );
            fire(niEl);

            const dobEl = document.querySelector('#UserDetails_date_of_birth');
            fire(dobEl);

            return {
                ok: true,
                genderChecked: !!checkedGender,
                nationalityValue: nationalityEl ? String(nationalityEl.value || '').trim() : '',
                niValue: niEl ? String(niEl.value || '').replace(/\\s+/g, '').toUpperCase() : '',
                dobValue: dobEl ? String(dobEl.value || '').trim() : ''
            };
            """,
            expected_gender,
            expected_nationality,
            expected_ni,
        )

        logging.info(
            "Core field values before wait | genderChecked=%s | nationality=%s | NI=%s | DOB=%s",
            result.get("genderChecked") if result else None,
            result.get("nationalityValue") if result else None,
            result.get("niValue") if result else None,
            result.get("dobValue") if result else None,
        )

        time.sleep(wait_seconds)

        # Verify again after the wait. If any core field has dropped, stop here.
        self.verify_personal_details_before_submit(row)


    def fill_personal_details(self, row: dict[str, Any]) -> str:
        """
        Smart Personal Details step.

        This version creates the profile even when optional personal details are blank.
        Missing fields are added to notes and written back to the Google Sheet message.
        """
        logging.info("Filling Personal Details in smart mode. Missing optional fields will be noted, not fatal.")

        self.wait_for_id("user-details-form", "Personal Details form")
        self.validate_core_sheet_values(row)

        gender = get(row, "Gender")
        nationality = normalise_nationality(get(row, "Nationality"))
        ni_number = normalise_ni_number(get(row, "NI / Social Security number", "NI no", "National Insurance Number"))

        if clean(gender):
            try:
                self.set_gender_field(gender)
            except Exception as exc:
                self.add_note(f"Gender not added ({gender}): {exc}")
        else:
            self.add_note("Gender missing. Left blank.")

        dob = normalise_date(get(row, "Date of Birth"))
        if dob:
            try:
                self.fill_by_id("UserDetails_date_of_birth", dob)
            except Exception as exc:
                self.add_note(f"Date of Birth not added ({dob}): {exc}")

        if clean(nationality):
            try:
                self.set_nationality_field(nationality)
            except Exception as exc:
                self.add_note(f"Nationality not added ({nationality}): {exc}")
        else:
            self.add_note("Nationality missing. Left blank.")

        birth_country = normalise_country(get(row, "Country of Birth", "Country Of Birth", "Birth Country", "Country", "Issuing Country"))
        if birth_country:
            try:
                self.select_by_id("UserDetails_birth_country_id", visible_text=birth_country)
            except Exception as exc:
                self.add_note(f"Birth Country not added ({birth_country}): {exc}")

        city_of_birth = get(row, "City Of Birth", "City of Birth", "Birth City", "Place of Birth")
        if city_of_birth:
            try:
                self.fill_by_id("UserDetails_city_of_birth", city_of_birth)
            except Exception as exc:
                self.add_note(f"City of Birth not added ({city_of_birth}): {exc}")

        if clean(ni_number):
            try:
                self.set_ni_number_field(ni_number)
            except Exception as exc:
                self.add_note(f"NI Number not added ({ni_number}): {exc}")
        else:
            self.add_note("NI / Social Security number missing. Left blank.")

        # Let Parim register whichever core fields were actually filled.
        try:
            self.stabilise_personal_core_fields(row, wait_seconds=3.0)
        except Exception as exc:
            self.add_note(f"Personal Details stabilisation warning: {exc}")

        driver_value = get(row, "Drivers Licence", "Drivers License", "Driving Licence", "Driving License")
        if driver_value:
            try:
                self.select_by_id("UserDetails_drivers_license", value="1" if has_real_value(driver_value) else "0")
            except Exception as exc:
                self.add_note(f"Drivers Licence yes/no not set: {exc}")

        visa_expiry = normalise_date(get(row, "Visa Expiry"))
        visa_description = get(row, "Visa Description")
        visa_required = bool(visa_expiry or visa_description)

        try:
            self.select_by_id("UserDetails_visa_needed", value="1" if visa_required else "0")
        except Exception as exc:
            self.add_note(f"Visa Required field not set: {exc}")

        if visa_required:
            try:
                time.sleep(0.5)
                self.fill_by_id("UserVisaDetails_visa_description", visa_description or "Visa details", required=True)
                self.fill_by_id("UserVisaDetails_expiry_date", visa_expiry, required=True)
            except Exception as exc:
                self.add_note(f"Visa details not added: {exc}")

        try:
            self.verify_personal_details_before_submit(row)
        except Exception as exc:
            self.add_note(f"Personal Details pre-save verification warning: {exc}")

        self.click_real_personal_details_save()
        return self.wait_finish()

    def wait_finish(self) -> str:
        """
        Wait for the final success page and return the actual person's profile URL.

        Important fix:
        Parim shows the profile link as a relative URL, for example:
            /admin/user/view?id=5679

        We must write this profile URL to Google Sheets, not the create URL:
            https://hd.parim.co/a/admin/user/create
        """
        logging.info("Waiting for final profile link")

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                function fullUrl(href) {
                    if (!href) return '';
                    href = String(href).replace(/&amp;/g, '&');
                    return new URL(href, window.location.origin).href;
                }

                // Primary selector from Parim final page.
                const userViewLink = document.querySelector('a.user-view-link');
                if (userViewLink) {
                    const href = userViewLink.getAttribute('href') || userViewLink.href || '';
                    if (href.includes('/admin/user/view?id=')) {
                        return fullUrl(href);
                    }
                }

                // Fallback selector in case the class changes but href remains the same.
                const hrefLink = document.querySelector('a[href*="/admin/user/view?id="]');
                if (hrefLink) {
                    const href = hrefLink.getAttribute('href') || hrefLink.href || '';
                    if (href.includes('/admin/user/view?id=')) {
                        return fullUrl(href);
                    }
                }

                // Last-resort parse from HTML. Useful when a link exists but is not visible yet.
                const html = document.documentElement ? document.documentElement.innerHTML : '';
                const match = html.match(/href=["']([^"']*\/admin\/user\/view\?id=\d+[^"']*)["']/i);
                if (match && match[1]) {
                    return fullUrl(match[1]);
                }

                // Do not return window.location.href here, because that is the create page.
                // Return a marker only so Python can keep waiting or leave profile blank.
                const bodyText = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
                if (bodyText.includes('successfully completed') || bodyText.includes("go to person's profile")) {
                    return 'SUCCESS_WITHOUT_PROFILE_URL';
                }

                return '';
                """
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("final_timeout")
            raise TimeoutException("Timeout waiting for final profile link. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

        if result == "SUCCESS_WITHOUT_PROFILE_URL":
            logging.warning("Created successfully, but profile link was not found. Profile URL will be blank, not the create URL.")
            return ""

        profile_url = str(result)
        if "/admin/user/view?id=" not in profile_url:
            logging.warning("Ignoring non-profile URL returned after creation: %s", profile_url)
            return ""

        logging.info("Created successfully. Profile URL: %s", profile_url)
        return profile_url

    def fill_first_available_field(
        self,
        label: str,
        value: str,
        selectors: list[str],
        required: bool = False,
    ) -> None:
        """
        Fill a field by trying multiple CSS selectors. Useful for Parim dialogs where
        the ID is predictable, but the pasted HTML may be incomplete.
        """
        value = clean(value)

        if value == "" and not required:
            logging.info("Skipped empty bank field: %s", label)
            return

        result = self.driver.execute_script(
            """
            const label = arguments[0];
            const value = arguments[1];
            const selectors = arguments[2] || [];

            let el = null;
            let selectorUsed = '';

            for (const selector of selectors) {
                el = document.querySelector(selector);
                if (el) {
                    selectorUsed = selector;
                    break;
                }
            }

            if (!el) {
                return {ok:false, message:'Field not found for ' + label + '. Tried: ' + selectors.join(', ')};
            }

            el.scrollIntoView({block:'center', inline:'nearest'});
            el.removeAttribute('readonly');
            el.removeAttribute('disabled');
            el.focus();

            const tag = (el.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') {
                const proto = tag === 'textarea'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (setter) setter.call(el, value);
                else el.value = value;
            } else {
                el.value = value;
            }

            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));

            return {ok:true, selector:selectorUsed, value:el.value};
            """,
            label,
            value,
            selectors,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", f"Could not fill {label}"))

        actual = clean(result.get("value", ""))
        if value and actual != value:
            raise RuntimeError(f"{label} did not keep value. Expected '{value}', got '{actual}'.")

        logging.info("Filled %s via %s = %s", label, result.get("selector"), value)

    def select_first_available_by_text(
        self,
        label: str,
        visible_text: str,
        selectors: list[str],
        required: bool = False,
    ) -> None:
        """Select the first matching select element by visible option text."""
        visible_text = clean(visible_text)

        if visible_text == "" and not required:
            logging.info("Skipped empty select field: %s", label)
            return

        result = self.driver.execute_script(
            """
            const label = arguments[0];
            const wanted = (arguments[1] || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const selectors = arguments[2] || [];

            let select = null;
            let selectorUsed = '';

            for (const selector of selectors) {
                select = document.querySelector(selector);
                if (select) {
                    selectorUsed = selector;
                    break;
                }
            }

            if (!select) {
                return {ok:false, missing:true, message:'Select not found for ' + label};
            }

            const options = Array.from(select.options || []);
            let option = options.find(o => (o.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === wanted);
            if (!option) {
                option = options.find(o => {
                    const t = (o.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    return t.includes(wanted) || wanted.includes(t);
                });
            }

            if (!option) {
                return {ok:false, message:'Option not found for ' + label + ': ' + wanted};
            }

            select.scrollIntoView({block:'center', inline:'nearest'});
            select.value = option.value;
            select.dispatchEvent(new Event('input', {bubbles:true}));
            select.dispatchEvent(new Event('change', {bubbles:true}));
            select.dispatchEvent(new Event('blur', {bubbles:true}));

            return {ok:true, selector:selectorUsed, text:option.textContent.trim(), value:select.value};
            """,
            label,
            visible_text,
            selectors,
        )

        if not result or not result.get("ok"):
            if result and result.get("missing") and not required:
                logging.info("Optional select not found: %s", label)
                return
            raise RuntimeError(result.get("message", f"Could not select {label}"))

        logging.info("Selected %s via %s = %s", label, result.get("selector"), result.get("text"))

    def row_has_work_details_data(self, row: dict[str, Any]) -> bool:
        """
        Return True when the Google Sheet row has UTR or Tax Code.

        Sheet mapping:
        - UserDetails_utr      = UTR
        - UserDetails_tax_code = Tax Code
        """
        utr = get(row, "UTR", "Unique Taxpayer Reference")
        tax_code = get(row, "Tax Code", "TaxCode")
        return bool(clean(utr) or clean(tax_code))

    def open_employment_tab_for_work_details(self, profile_url: str) -> None:
        """
        Open the created profile and switch to Employment tab.

        Parim HTML:
        - Employment tab panel: #employment
        - Work Details section: #work-details
        - Edit link: a.edit-work-details-link
        """
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot update UTR/Tax Code because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening profile Employment tab for Work Details: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        self.wait_for_id("yw1", "profile tabs")

        result = self.driver.execute_script(
            """
            const tabLink = document.querySelector('a[href="#employment"]');
            const employmentPanel = document.getElementById('employment');

            if (!tabLink || !employmentPanel) {
                return {ok:false, message:'Employment tab or #employment panel not found'};
            }

            tabLink.scrollIntoView({block:'center', inline:'nearest'});
            tabLink.click();

            document.querySelectorAll('.ui-tabs-panel').forEach(panel => {
                if (panel.id === 'employment') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            });

            const li = tabLink.closest('li');
            if (li) {
                document.querySelectorAll('#yw1 .ui-tabs-nav li').forEach(x => {
                    x.classList.remove('ui-tabs-selected', 'ui-state-active');
                });
                li.classList.add('ui-tabs-selected', 'ui-state-active');
            }

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not open Employment tab"))

        self.wait_for_id("work-details", "Work Details section")
        logging.info("Employment tab Work Details section is ready")

    def click_work_details_edit(self) -> None:
        """Click Employment tab > Work Details > Edit."""
        logging.info("Clicking Work Details Edit")
        self.wait_for_id("work-details", "Work Details section")

        result = self.driver.execute_script(
            """
            const section = document.getElementById('work-details');
            const link = (section && section.querySelector('a.edit-work-details-link'))
                || document.querySelector('a.edit-work-details-link');

            if (!link) {
                return {ok:false, message:'Work Details edit link not found: a.edit-work-details-link'};
            }

            link.scrollIntoView({block:'center', inline:'nearest'});
            link.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Work Details Edit"))

        logging.info("Waiting for Work Details dialog")
        time.sleep(2)

        self.wait_for_id("update-user-work-details-dialog-form", "Work Details dialog form")
        self.wait_for_id("UserDetails_utr", "UTR")
        self.wait_for_id("UserDetails_tax_code", "Tax Code")
        logging.info("Work Details dialog is ready")


    def row_has_profile_title_region_city_birth_data(self, row: dict[str, Any]) -> bool:
        """
        Return True when the row has Title, Region or City Of Birth.

        Sheet columns:
        - Title
        - Region
        - City Of Birth
        """
        title = get(row, "Title")
        region = get(row, "Region", "Regions")
        city_of_birth = get(row, "City Of Birth", "City of Birth", "Birth City", "Place of Birth")
        return bool(clean(title) or clean(region) or clean(city_of_birth))

    def open_profile_update_details_dialog(self, profile_url: str) -> None:
        """
        Open profile and click the main Details Edit button.

        HTML supplied:
        <a class="btn btn-success btn-xs bl update-user-details-link">Edit</a>

        The form that opens:
        #update-user-details-dialog-form
        """
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot update Title/Region/City Of Birth because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening profile to update Title, Region and City Of Birth: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        self.wait_for_id("yw1", "profile tabs")

        result = self.driver.execute_script(
            """
            const mainTab = document.querySelector('a[href="#main"]');
            if (mainTab) {
                mainTab.scrollIntoView({block:'center', inline:'nearest'});
                mainTab.click();
            }

            document.querySelectorAll('.ui-tabs-panel').forEach(panel => {
                if (panel.id === 'main') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            });

            const link =
                document.querySelector('a.update-user-details-link') ||
                document.querySelector('.profile-update a.btn-success') ||
                Array.from(document.querySelectorAll('a.btn-success, a.btn, a')).find(a => {
                    const text = (a.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                    return text === 'edit' && (a.className || '').toString().includes('update-user-details');
                });

            if (!link) {
                return {ok:false, message:'Profile update Edit link .update-user-details-link not found'};
            }

            link.scrollIntoView({block:'center', inline:'nearest'});
            link.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click profile update Edit"))

        logging.info("Waiting for update-user-details-dialog-form")
        time.sleep(2)
        self.wait_for_id("update-user-details-dialog-form", "Update User Details form")
        logging.info("Profile update dialog is ready")

    def set_profile_regions_from_sheet(self, region_value: str) -> list[str]:
        """
        Tick Region checkboxes in the update-user-details-dialog-form.

        Parim field:
        input name="UserDetails[userRegions][]"

        Examples:
        - West London
        - East London
        - South London
        - North London
        - Central London
        - Out of London
        """
        selected: list[str] = []

        for region in split_multi(region_value):
            ok = self.check_label_checkbox("UserDetails[userRegions][]", region)
            if ok:
                selected.append(region)
                logging.info("Selected profile region: %s", region)
            else:
                self.add_note(f"Region not found on profile edit form: {region}")

        return selected

    def update_profile_title_region_city_birth(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Update Title, Region and City Of Birth after the profile is created.

        Sheet columns:
        - Title          -> UserDetails_user_title
        - Region         -> UserDetails[userRegions][]
        - City Of Birth  -> UserDetails_city_of_birth

        This is optional. Missing values are skipped and added to notes where useful.
        """
        if not self.row_has_profile_title_region_city_birth_data(row):
            logging.info("No Title/Region/City Of Birth data found. Skipping profile update step.")
            return

        title = get(row, "Title")
        region = get(row, "Region", "Regions")
        city_of_birth = get(row, "City Of Birth", "City of Birth", "Birth City", "Place of Birth")

        logging.info(
            "Updating profile extra fields | Title=%s | Region=%s | City Of Birth=%s",
            title or "blank",
            region or "blank",
            city_of_birth or "blank",
        )

        self.open_profile_update_details_dialog(profile_url)

        if clean(title):
            try:
                self.select_by_id("UserDetails_user_title", visible_text=title)
                self.add_note(f"Title added/updated: {title}")
            except Exception as exc:
                self.add_note(f"Title not updated ({title}): {type(exc).__name__}: {exc}")

        if clean(city_of_birth):
            try:
                self.fill_by_id("UserDetails_city_of_birth", city_of_birth)
                self.add_note(f"City Of Birth added/updated: {city_of_birth}")
            except Exception as exc:
                self.add_note(f"City Of Birth not updated ({city_of_birth}): {type(exc).__name__}: {exc}")

        if clean(region):
            self.set_profile_regions_from_sheet(region)

        # Let old Parim JS register select/checkbox/input changes.
        time.sleep(1)

        self.click_submit_in_form("update-user-details-dialog-form", "Update")

        # Wait for dialog to close or the page to stop showing the form.
        try:
            WebDriverWait(self.driver, 30).until(
                lambda _d: self.driver.execute_script(
                    """
                    const form = document.getElementById('update-user-details-dialog-form');
                    if (!form) return true;
                    const st = window.getComputedStyle(form);
                    const visible = st.display !== 'none' && st.visibility !== 'hidden' &&
                        !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
                    return !visible;
                    """
                )
            )
        except TimeoutException:
            self.save_debug_page("profile_update_dialog_still_open")
            self.add_note("Profile update submitted, but dialog did not close within 30 seconds.")

        errors = self.get_visible_errors()
        if errors:
            raise RuntimeError(f"Profile update form error: {errors}")

        logging.info("Profile Title/Region/City Of Birth update step completed")


    def add_work_details_utr_tax_code(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add/update UTR and Tax Code in Employment > Work Details.

        Sheet mapping:
        - UTR      -> UserDetails_utr
        - Tax Code -> UserDetails_tax_code
        """
        if not self.row_has_work_details_data(row):
            logging.info("No UTR or Tax Code found in sheet row. Skipping Work Details update.")
            return

        utr = clean(get(row, "UTR", "Unique Taxpayer Reference"))
        tax_code = clean(get(row, "Tax Code", "TaxCode"))

        logging.info("Updating Work Details for profile: %s | UTR=%s | Tax Code=%s", profile_url, utr or "blank", tax_code or "blank")

        self.open_employment_tab_for_work_details(profile_url)
        self.click_work_details_edit()

        # Preserve/refresh NI Number because Work Details dialog contains NI as well.
        ni_number = normalise_ni_number(get(row, "NI / Social Security number", "NI no", "National Insurance Number"))
        if ni_number:
            self.fill_by_id("UserDetails_nin", ni_number, required=False)

        if utr:
            self.fill_by_id("UserDetails_utr", utr, required=True)

        if tax_code:
            self.fill_by_id("UserDetails_tax_code", tax_code, required=True)

        time.sleep(1)
        self.verify_work_details_before_update(utr, tax_code, ni_number)
        self.click_submit_in_form("update-user-work-details-dialog-form", "Update")
        self.wait_for_work_details_saved(utr, tax_code, ni_number)
        logging.info("Work Details UTR/Tax Code saved successfully")

    def verify_work_details_before_update(self, utr: str, tax_code: str, ni_number: str = "") -> None:
        """Verify UTR and Tax Code dialog values before clicking Update."""
        result = self.driver.execute_script(
            """
            const expectedUtr = arguments[0] || '';
            const expectedTaxCode = arguments[1] || '';
            const expectedNi = arguments[2] || '';

            function valueOf(id) {
                const el = document.getElementById(id);
                return el ? String(el.value || '').trim() : '';
            }

            const actualUtr = valueOf('UserDetails_utr');
            const actualTaxCode = valueOf('UserDetails_tax_code');
            const actualNi = valueOf('UserDetails_nin').replace(/\\s+/g, '').toUpperCase();

            const errors = [];

            if (expectedUtr && actualUtr !== expectedUtr) {
                errors.push('UTR mismatch. Expected=' + expectedUtr + ', Actual=' + actualUtr);
            }

            if (expectedTaxCode && actualTaxCode !== expectedTaxCode) {
                errors.push('Tax Code mismatch. Expected=' + expectedTaxCode + ', Actual=' + actualTaxCode);
            }

            if (expectedNi && actualNi !== expectedNi) {
                errors.push('NI mismatch in Work Details dialog. Expected=' + expectedNi + ', Actual=' + actualNi);
            }

            return {ok: errors.length === 0, errors, actualUtr, actualTaxCode, actualNi};
            """,
            utr,
            tax_code,
            ni_number,
        )

        if not result or not result.get("ok"):
            raise RuntimeError("Work Details verification failed: " + " | ".join(result.get("errors", [])))

        logging.info(
            "Verified Work Details before Update | UTR=%s | Tax Code=%s | NI=%s",
            result.get("actualUtr"),
            result.get("actualTaxCode"),
            result.get("actualNi"),
        )

    def wait_for_work_details_saved(self, utr: str, tax_code: str, ni_number: str = "") -> None:
        """Wait until Work Details dialog closes or profile section shows UTR/Tax Code."""
        logging.info("Waiting for Work Details save confirmation")

        expected_utr = clean(utr).lower()
        expected_tax = clean(tax_code).lower()
        expected_ni = clean(ni_number).lower()

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const expectedUtr = arguments[0];
                const expectedTax = arguments[1];
                const expectedNi = arguments[2];

                const section = document.querySelector('#work-details');
                const utrText = (section?.querySelector('.utr')?.textContent || '').trim().toLowerCase();
                const taxText = (section?.querySelector('.tax_code')?.textContent || '').trim().toLowerCase();
                const niText = (section?.querySelector('.nin')?.textContent || '').trim().replace(/\\s+/g, '').toLowerCase();

                let ok = true;
                if (expectedUtr) ok = ok && utrText.includes(expectedUtr);
                if (expectedTax) ok = ok && taxText.includes(expectedTax);
                if (expectedNi) ok = ok && niText.includes(expectedNi);

                if (ok && (expectedUtr || expectedTax || expectedNi)) {
                    return 'saved';
                }

                const form = document.getElementById('update-user-work-details-dialog-form');
                const formVisible = form && !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);

                if (!formVisible) {
                    return 'saved';
                }

                return '';
                """,
                expected_utr,
                expected_tax,
                expected_ni,
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("work_details_save_timeout")
            raise TimeoutException("Timeout waiting for Work Details save confirmation. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))


    def row_has_passport_data(self, row: dict[str, Any]) -> bool:
        """Return True when the sheet row contains passport/ID-card data worth adding."""
        doc_no = get(row, "Passport / ID Card Document No", "Passport Document No", "ID Card Document No", "Document No")
        issuing_country = normalise_country(get(row, "Issuing Country", "Country Of Issue", "Country of Issue"))
        date_issue = get(row, "Date of Issue", "Date Issued")
        expiry_date = get(row, "Expiry Date", "Date Of Expiry", "Date Expires")
        return bool(doc_no or issuing_country or date_issue or expiry_date)

    def open_profile_page_for_extra_details(self, profile_url: str) -> None:
        """
        Open the created person's profile page and wait until the Details tab is loaded.
        The profile contains the Passport/ID-Card section on the Details tab.
        """
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot add passport details because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening created profile for extra details: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        # The uploaded profile HTML has the tabs container id='yw1' and Passport/ID-Card section id='passport-details'.
        self.wait_for_id("yw1", "profile tabs")
        self.wait_for_id("passport-details", "Passport/ID-Card section")
        logging.info("Profile Details tab is ready")

    def click_passport_edit(self) -> None:
        """Click Passport/ID-Card > Edit on the profile Details tab."""
        logging.info("Clicking Passport/ID-Card Edit")
        self.wait_for_id("passport-details", "Passport/ID-Card section")

        result = self.driver.execute_script(
            """
            const section = document.getElementById('passport-details');
            if (!section) return {ok:false, message:'passport-details section not found'};

            const link = section.querySelector('a.update-user-passport')
                || document.querySelector('a.update-user-passport');

            if (!link) return {ok:false, message:'Passport edit link not found'};

            link.scrollIntoView({block:'center', inline:'nearest'});
            link.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Passport/ID-Card Edit"))

        logging.info("Waiting %s seconds for passport dialog", self.passport_dialog_wait)
        time.sleep(self.passport_dialog_wait)

        self.wait_for_id("update-user-passport-dialog-form", "Passport dialog form")
        self.wait_for_id("UserPassport_document_no", "Passport Document No")
        logging.info("Passport dialog is ready")

    def add_passport_details(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add Passport/ID-Card details after the user profile has been created.

        Sheet mapping:
        - Document No       = Passport / ID Card Document No
        - Country Of Issue  = Issuing Country
        - Date Of Issue     = Date of Issue
        - Date Of Expiry    = Expiry Date
        """
        if not self.row_has_passport_data(row):
            logging.info("No passport/ID-card data found in sheet row. Skipping passport step.")
            return

        document_no = get(row, "Passport / ID Card Document No", "Passport Document No", "ID Card Document No", "Document No")
        issuing_country = normalise_country(get(row, "Issuing Country", "Country Of Issue", "Country of Issue"))
        date_of_issue = normalise_date(get(row, "Date of Issue", "Date Issued"))
        date_of_expiry = normalise_date(get(row, "Expiry Date", "Date Of Expiry", "Date Expires"))

        logging.info("Adding passport details for profile: %s", profile_url)
        self.open_profile_page_for_extra_details(profile_url)
        self.click_passport_edit()

        self.fill_by_id("UserPassport_document_no", document_no, required=True)
        self.select_by_id("UserPassport_country_of_issue_id", visible_text=issuing_country, required=True)
        self.fill_by_id("date_of_issue", date_of_issue, required=True)
        self.fill_by_id("date_of_expiry", date_of_expiry, required=True)

        self.click_submit_in_form("update-user-passport-dialog-form", "Create")
        self.wait_for_passport_saved(document_no)
        logging.info("Passport/ID-Card details saved successfully")

    def wait_for_passport_saved(self, document_no: str) -> None:
        """Wait until the passport dialog closes or the profile section shows the document number."""
        logging.info("Waiting for passport save confirmation")
        expected = clean(document_no).lower()

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const expected = (arguments[0] || '').toLowerCase();

                const docText = (document.querySelector('#passport-details .document-no')?.textContent || '').trim().toLowerCase();
                if (expected && docText && docText.includes(expected)) {
                    return 'saved';
                }

                const form = document.getElementById('update-user-passport-dialog-form');
                const dialog = document.getElementById('update-user-passport-dialog');

                const formVisible = form && !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
                const dialogVisible = dialog && !!(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length);

                if (!formVisible && !dialogVisible) {
                    return 'saved';
                }

                return '';
                """,
                expected,
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("passport_save_timeout")
            raise TimeoutException("Timeout waiting for passport save confirmation. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

    def row_has_emergency_contact_data(self, row: dict[str, Any]) -> bool:
        """
        Return True when the Google Sheet row has emergency contact data.

        Sheet mapping:
        - Emergency Contact Name       -> First Name
        - Emergency Contact Last Name  -> Last Name
        - Emergency Phone No           -> Phone
        - Emergency Relation to user   -> Relation To User
        """
        first_name = get(row, "Emergency Contact Name", "Emergency First Name", "Emergency Contact First Name")
        last_name = get(row, "Emergency Contact Last Name", "Emergency Last Name")
        phone = get(row, "Emergency Phone No", "Emergency Phone", "Emergency Contact Phone", "Emergency Contact Number")
        relation = get(row, "Emergency Relation to user", "Emergency Relation To User", "Emergency Relation", "Emergency Contact Relation")

        return bool(clean(first_name) or clean(last_name) or clean(phone) or clean(relation))

    def get_emergency_contact_details(self, row: dict[str, Any]) -> dict[str, str]:
        """Read and validate emergency contact details from the Google Sheet row."""
        first_name = get(row, "Emergency Contact Name", "Emergency First Name", "Emergency Contact First Name")
        last_name = get(row, "Emergency Contact Last Name", "Emergency Last Name")
        phone = normalise_phone(get(row, "Emergency Phone No", "Emergency Phone", "Emergency Contact Phone", "Emergency Contact Number"))
        relation = get(row, "Emergency Relation to user", "Emergency Relation To User", "Emergency Relation", "Emergency Contact Relation")

        missing = []
        if not clean(first_name):
            missing.append("Emergency Contact Name")
        if not clean(last_name):
            missing.append("Emergency Contact Last Name")
        if not clean(phone):
            missing.append("Emergency Phone No")
        if not clean(relation):
            missing.append("Emergency Relation to user")

        if missing:
            raise RuntimeError(
                "Emergency contact data is partially filled. Missing required column value(s): "
                + ", ".join(missing)
            )

        return {
            "first_name": clean(first_name),
            "last_name": clean(last_name),
            "phone": clean(phone),
            "relation": clean(relation),
        }

    def click_emergency_contact_add(self) -> None:
        """
        Click Details tab > Emergency Contacts > Add and wait for the dialog.

        Parim section HTML:
        - Add link class: add-emergency-contact-link
        - Dialog form id: add-user-emergency-contact-dialog-form
        """
        logging.info("Clicking Emergency Contacts Add")

        # Details tab must be available. open_profile_page_for_extra_details already waits for yw1.
        result = self.driver.execute_script(
            """
            // Make sure the Details/Main tab is active because Emergency Contacts is inside Details.
            const mainTab = document.querySelector('a[href="#main"]');
            if (mainTab) {
                mainTab.scrollIntoView({block:'center', inline:'nearest'});
                mainTab.click();
            }

            document.querySelectorAll('.ui-tabs-panel').forEach(panel => {
                if (panel.id === 'main') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            });

            const link = document.querySelector('a.add-emergency-contact-link');

            if (!link) {
                return {ok:false, message:'Emergency Contacts Add link not found: a.add-emergency-contact-link'};
            }

            link.scrollIntoView({block:'center', inline:'nearest'});
            link.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Emergency Contacts Add"))

        logging.info("Waiting for Emergency Contact dialog")
        time.sleep(2)

        self.wait_for_id("add-user-emergency-contact-dialog-form", "Emergency Contact dialog form")
        self.wait_for_id("UserEmergencyContact_first_name", "Emergency First Name")
        self.wait_for_id("UserEmergencyContact_last_name", "Emergency Last Name")
        self.wait_for_id("UserEmergencyContact_phone", "Emergency Phone")
        self.wait_for_id("UserEmergencyContact_relation_to_user", "Emergency Relation To User")
        logging.info("Emergency Contact dialog is ready")

    def add_emergency_contact(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add Emergency Contact details after profile creation.

        Sheet mapping:
        - UserEmergencyContact_first_name        = Emergency Contact Name
        - UserEmergencyContact_last_name         = Emergency Contact Last Name
        - UserEmergencyContact_phone             = Emergency Phone No
        - UserEmergencyContact_relation_to_user  = Emergency Relation to user
        """
        if not self.row_has_emergency_contact_data(row):
            logging.info("No emergency contact data found in sheet row. Skipping emergency contact step.")
            return

        details = self.get_emergency_contact_details(row)

        logging.info(
            "Adding emergency contact for profile: %s | %s %s",
            profile_url,
            details["first_name"],
            details["last_name"],
        )

        self.open_profile_page_for_extra_details(profile_url)
        self.click_emergency_contact_add()

        self.fill_by_id("UserEmergencyContact_first_name", details["first_name"], required=True)
        self.fill_by_id("UserEmergencyContact_last_name", details["last_name"], required=True)
        self.fill_by_id("UserEmergencyContact_phone", details["phone"], required=True)
        self.fill_by_id("UserEmergencyContact_relation_to_user", details["relation"], required=True)

        # Give Parim's old dialog JS time to register all four required fields.
        time.sleep(1)

        self.verify_emergency_contact_before_save(details)
        self.click_submit_in_form("add-user-emergency-contact-dialog-form", "Save")
        self.wait_for_emergency_contact_saved(details)
        logging.info("Emergency contact saved successfully")

    def verify_emergency_contact_before_save(self, details: dict[str, str]) -> None:
        """Verify all required emergency contact dialog fields before clicking Save."""
        result = self.driver.execute_script(
            """
            const expected = arguments[0];

            function valueOf(id) {
                const el = document.getElementById(id);
                return el ? String(el.value || '').trim() : '';
            }

            const actual = {
                first_name: valueOf('UserEmergencyContact_first_name'),
                last_name: valueOf('UserEmergencyContact_last_name'),
                phone: valueOf('UserEmergencyContact_phone'),
                relation: valueOf('UserEmergencyContact_relation_to_user')
            };

            const errors = [];

            if (actual.first_name !== expected.first_name) {
                errors.push('First Name mismatch. Expected=' + expected.first_name + ', Actual=' + actual.first_name);
            }
            if (actual.last_name !== expected.last_name) {
                errors.push('Last Name mismatch. Expected=' + expected.last_name + ', Actual=' + actual.last_name);
            }
            if (actual.phone !== expected.phone) {
                errors.push('Phone mismatch. Expected=' + expected.phone + ', Actual=' + actual.phone);
            }
            if (actual.relation !== expected.relation) {
                errors.push('Relation mismatch. Expected=' + expected.relation + ', Actual=' + actual.relation);
            }

            return {ok: errors.length === 0, errors, actual};
            """,
            details,
        )

        if not result or not result.get("ok"):
            raise RuntimeError("Emergency Contact verification failed: " + " | ".join(result.get("errors", [])))

        logging.info("Verified Emergency Contact before Save")

    def wait_for_emergency_contact_saved(self, details: dict[str, str]) -> None:
        """Wait until the emergency contact dialog closes or the contact appears in the list."""
        logging.info("Waiting for emergency contact save confirmation")

        expected_name = (details["first_name"] + " " + details["last_name"]).strip().lower()
        expected_phone = clean(details["phone"]).lower()

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const expectedName = arguments[0];
                const expectedPhone = arguments[1];

                const listText = (document.querySelector('#emergencyContactsList')?.innerText || '').toLowerCase();

                if (listText) {
                    if (expectedName && listText.includes(expectedName)) return 'saved';
                    if (expectedPhone && listText.includes(expectedPhone)) return 'saved';
                }

                const form = document.getElementById('add-user-emergency-contact-dialog-form');
                const dialog = document.getElementById('add-user-emergency-contact-dialog');

                const formVisible = form && !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
                const dialogVisible = dialog && !!(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length);

                if (!formVisible && !dialogVisible) {
                    return 'saved';
                }

                return '';
                """,
                expected_name,
                expected_phone,
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("emergency_contact_save_timeout")
            raise TimeoutException("Timeout waiting for emergency contact save confirmation. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))


    def row_has_bank_data(self, row: dict[str, Any]) -> bool:
        """Return True when the Google Sheet row has bank details worth adding."""
        account_number = get(row, "Account Number", "Bank Account Number")
        sort_code = get(row, "Sort Code", "Bank Sort Code")
        return bool(account_number or sort_code)

    def click_bank_details_edit(self) -> None:
        """Click Bank Account > Edit on the profile Details tab."""
        logging.info("Clicking Bank Account Edit")
        self.wait_for_id("bank-details", "Bank Account section")

        result = self.driver.execute_script(
            """
            const section = document.getElementById('bank-details');
            const link = (section && section.querySelector('a.update-user-bank-details'))
                || document.querySelector('a.update-user-bank-details');

            if (!link) {
                return {ok:false, message:'Bank Account edit link not found'};
            }

            link.scrollIntoView({block:'center', inline:'nearest'});
            link.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Bank Account Edit"))

        logging.info("Waiting %s seconds for bank details dialog", self.bank_dialog_wait)
        time.sleep(self.bank_dialog_wait)
        self.wait_for_bank_dialog_ready()

    def wait_for_bank_dialog_ready(self) -> None:
        """Wait until the bank dialog is ready to accept Account Number and Sort Code."""
        logging.info("Waiting for bank details dialog fields")

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const confirmBtn = document.querySelector('.edit-user-bank-details-confirm');
                const accountNumber = document.querySelector('#UserBankDetails_account_number, input[name="UserBankDetails[account_number]"]');
                const sortCode = document.querySelector('#UserBankDetails_sort_code, input[name="UserBankDetails[sort_code]"]');
                const splitSortCode = document.querySelector('#UserBankDetails_sort_code_1, input[name="UserBankDetails[sort_code_1]"]');
                if (confirmBtn && (accountNumber || sortCode || splitSortCode)) return 'ready';

                // In case Parim loads the form but some fields are hidden until country rules apply.
                if (confirmBtn && document.body.innerText.toLowerCase().includes('account')) return 'ready';
                return '';
                """
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("bank_dialog_timeout")
            raise TimeoutException("Timeout waiting for bank details dialog. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

        logging.info("Bank details dialog is ready")

    def fill_sort_code_fields(self, sort_code: str) -> None:
        """
        Fill Parim UK sort code correctly.

        Parim uses 3 visible fields:
        - UserBankDetails_sort_code_1
        - UserBankDetails_sort_code_2
        - UserBankDetails_sort_code_3

        and one hidden combined field:
        - UserBankDetails_sort_code

        If the sheet has 00-00-01, this method fills:
        - 00
        - 00
        - 01
        - hidden = 000001
        """
        p1, p2, p3, combined = normalise_sort_code(sort_code)

        if not combined:
            raise RuntimeError("Sort Code is empty. Add a value such as 00-00-01 in the sheet.")

        result = self.driver.execute_script(
            """
            const p1 = arguments[0];
            const p2 = arguments[1];
            const p3 = arguments[2];
            const combined = arguments[3];

            const f1 = document.querySelector('#UserBankDetails_sort_code_1, input[name="UserBankDetails[sort_code_1]"]');
            const f2 = document.querySelector('#UserBankDetails_sort_code_2, input[name="UserBankDetails[sort_code_2]"]');
            const f3 = document.querySelector('#UserBankDetails_sort_code_3, input[name="UserBankDetails[sort_code_3]"]');
            const hidden = document.querySelector('#UserBankDetails_sort_code, input[name="UserBankDetails[sort_code]"]');

            if (!f1 || !f2 || !f3) {
                return {
                    ok: false,
                    message: 'Visible sort-code fields not found. Expected #UserBankDetails_sort_code_1, _2, _3'
                };
            }

            function setValue(el, value) {
                el.scrollIntoView({block:'center', inline:'nearest'});
                el.removeAttribute('readonly');
                el.removeAttribute('disabled');
                el.focus();

                const proto = window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

                if (setter) setter.call(el, value);
                else el.value = value;

                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
                el.dispatchEvent(new Event('blur', {bubbles:true}));
            }

            setValue(f1, p1);
            setValue(f2, p2);
            setValue(f3, p3);

            if (hidden) {
                setValue(hidden, combined);
            }

            return {
                ok: true,
                part1: f1.value,
                part2: f2.value,
                part3: f3.value,
                hidden: hidden ? hidden.value : ''
            };
            """,
            p1,
            p2,
            p3,
            combined,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not fill Sort Code fields"))

        if result.get("part1") != p1 or result.get("part2") != p2 or result.get("part3") != p3:
            raise RuntimeError(
                f"Sort Code did not keep values. Expected {p1}-{p2}-{p3}, "
                f"got {result.get('part1')}-{result.get('part2')}-{result.get('part3')}"
            )

        logging.info("Filled Sort Code = %s-%s-%s | hidden=%s", p1, p2, p3, combined)

    def add_bank_details(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add Bank Account details after profile creation.

        Sheet mapping:
        - Account Number = Account Number
        - Sort Code      = Sort Code

        Country and Account Holder's Name are expected to be prefilled by Parim.
        For United Kingdom bank rules, Parim requires account holder, account number, and sort code.
        """
        if not self.row_has_bank_data(row):
            logging.info("No bank details found in sheet row. Skipping bank details step.")
            return

        account_number = normalise_phone(get(row, "Account Number", "Bank Account Number"))
        sort_code = clean(get(row, "Sort Code", "Bank Sort Code"))
        country = get(row, "Bank Country", "Country", default="United Kingdom") or "United Kingdom"

        logging.info("Adding bank details for profile: %s", profile_url)
        self.open_profile_page_for_extra_details(profile_url)
        self.click_bank_details_edit()

        # Keep the country as United Kingdom. If the country select exists, set it explicitly.
        self.select_first_available_by_text(
            "Bank Country",
            country,
            [
                "#UserBankDetails_country_id",
                'select[name="UserBankDetails[country_id]"]',
                'select[name="UserBankDetails[country]"]',
            ],
            required=False,
        )
        time.sleep(0.5)

        self.fill_first_available_field(
            "Account Number",
            account_number,
            [
                "#UserBankDetails_account_number",
                'input[name="UserBankDetails[account_number]"]',
            ],
            required=True,
        )

        self.fill_sort_code_fields(sort_code)

        self.click_bank_confirm()
        self.wait_for_bank_saved(account_number)
        logging.info("Bank details saved successfully")

    def click_bank_confirm(self) -> None:
        """Click the Confirm button in the bank details dialog."""
        result = self.driver.execute_script(
            """
            const btn = document.querySelector('.edit-user-bank-details-confirm');
            if (!btn) return {ok:false, message:'Bank details Confirm button not found'};
            btn.scrollIntoView({block:'center', inline:'nearest'});
            btn.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click bank details Confirm"))

        logging.info("Clicked Bank Account Confirm")

    def wait_for_bank_saved(self, account_number: str) -> None:
        """Wait until the bank dialog closes or the profile bank section is no longer empty."""
        logging.info("Waiting for bank details save confirmation")
        expected = clean(account_number).lower()

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const expected = (arguments[0] || '').toLowerCase();
                const sectionText = (document.querySelector('#bank-details')?.innerText || '').toLowerCase();

                if (sectionText && !sectionText.includes('- not set -')) {
                    return 'saved';
                }

                // If Parim shows the account number or part of it in the bank section.
                if (expected && sectionText && sectionText.includes(expected.slice(-4))) {
                    return 'saved';
                }

                const confirmBtn = document.querySelector('.edit-user-bank-details-confirm');
                const visibleConfirm = confirmBtn && !!(confirmBtn.offsetWidth || confirmBtn.offsetHeight || confirmBtn.getClientRects().length);
                if (!visibleConfirm) {
                    return 'saved';
                }

                return '';
                """,
                expected,
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("bank_save_timeout")
            raise TimeoutException("Timeout waiting for bank details save confirmation. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

    def row_has_sia_badge_data(self, row: dict[str, Any]) -> bool:
        """
        Return True when Google Sheet says SIA Badge should be added.

        Required sheet columns:
        - SIA Badge          = Yes
        - SIA Badge Number   = certificate number
        - SIA Expiry Date    = expiry date
        """
        sia_badge = get(row, "SIA Badge", "SIA Badge Required", "Add SIA Badge")
        badge_number = get(row, "SIA Badge Number", "SIA Number", "SIA Licence Number", "SIA License Number")
        expiry_date = get(row, "SIA Expiry Date", "SIA Badge Expiry Date", "SIA Licence Expiry", "SIA License Expiry")

        return truthy(sia_badge) and bool(clean(badge_number) or clean(expiry_date))

    def open_expertise_tab(self, profile_url: str) -> None:
        """
        Open the created person's profile and switch to the Expertise tab.
        The uploaded profile HTML shows:
        - tab link href="#cert"
        - tab panel id="cert"
        - add qualification link class="add-certificate-btn"
        """
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot add qualification because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening profile for SIA Badge qualification: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        self.wait_for_id("yw1", "profile tabs")

        result = self.driver.execute_script(
            """
            const tabLink = document.querySelector('a[href="#cert"]');
            const certPanel = document.getElementById('cert');

            if (!tabLink || !certPanel) {
                return {ok:false, message:'Expertise tab or #cert panel not found'};
            }

            tabLink.scrollIntoView({block:'center', inline:'nearest'});
            tabLink.click();

            // Fallback for old jQuery UI tabs if direct click does not activate instantly.
            const allPanels = Array.from(document.querySelectorAll('.ui-tabs-panel'));
            for (const panel of allPanels) {
                if (panel.id === 'cert') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            }

            const li = tabLink.closest('li');
            if (li) {
                document.querySelectorAll('#yw1 .ui-tabs-nav li').forEach(x => {
                    x.classList.remove('ui-tabs-selected', 'ui-state-active');
                });
                li.classList.add('ui-tabs-selected', 'ui-state-active');
            }

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not open Expertise tab"))

        # Wait for the Add Qualification button from the Expertise tab.
        self.wait_for_add_certificate_button()
        logging.info("Expertise tab is ready")

    def wait_for_add_certificate_button(self) -> None:
        """Wait until the Qualification Add button is available."""
        logging.info("Waiting for Qualification Add button")

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const btn = document.querySelector('#cert .add-certificate-btn, a.add-certificate-btn');
                if (btn) return 'ready';
                return '';
                """
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("qualification_add_button_timeout")
            raise TimeoutException("Timeout waiting for Qualification Add button. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

    def click_add_qualification(self) -> None:
        """Click Qualifications > Add and wait for the Add Qualification dialog."""
        logging.info("Clicking Qualifications Add")

        result = self.driver.execute_script(
            """
            const btn = document.querySelector('#cert .add-certificate-btn, a.add-certificate-btn');
            if (!btn) {
                return {ok:false, message:'Qualification Add button not found'};
            }

            btn.scrollIntoView({block:'center', inline:'nearest'});
            btn.click();
            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Qualification Add"))

        logging.info("Waiting %s seconds for qualification dialog", self.qualification_dialog_wait)
        time.sleep(self.qualification_dialog_wait)

        self.wait_for_qualification_dialog_ready()

    def wait_for_qualification_dialog_ready(self) -> None:
        """Wait until Add Qualification dialog form is ready."""
        logging.info("Waiting for Add Qualification dialog")

        def condition(_driver):
            errors = self.get_visible_errors()
            # The dialog can initially contain a historical hidden error such as
            # "Qualification cannot be blank." before user input. Ignore it until after save.
            if errors and "cannot be blank" not in errors.lower():
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const form = document.getElementById('add-user-certificate-dialog-form');
                const qualification = document.getElementById('UserToCertificates_certificate_id');
                const number = document.getElementById('UserToCertificates_certificate_number');
                const saveBtn = form ? Array.from(form.querySelectorAll('input[type="submit"], button[type="submit"]'))
                    .find(b => ((b.value || b.textContent || '').toLowerCase()).includes('save')) : null;

                if (form && qualification && number && saveBtn) return 'ready';
                return '';
                """
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("qualification_dialog_timeout")
            raise TimeoutException("Timeout waiting for Add Qualification dialog. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

        logging.info("Add Qualification dialog is ready")

    def add_sia_badge_qualification(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add SIA Badge qualification from Google Sheet.

        Sheet mapping:
        - SIA Badge        = Yes
        - SIA Badge Number = Certificate Number
        - SIA Expiry Date  = Expiry Date
        """
        if not self.row_has_sia_badge_data(row):
            logging.info("SIA Badge is not marked Yes or has no badge data. Skipping qualification step.")
            return

        badge_number = get(row, "SIA Badge Number", "SIA Number", "SIA Licence Number", "SIA License Number")
        expiry_date = normalise_date(get(row, "SIA Expiry Date", "SIA Badge Expiry Date", "SIA Licence Expiry", "SIA License Expiry"))

        if not clean(badge_number):
            raise RuntimeError("SIA Badge is Yes, but SIA Badge Number is empty in the sheet.")

        logging.info("Adding SIA Badge qualification. Number=%s Expiry=%s", badge_number, expiry_date)

        self.open_expertise_tab(profile_url)
        self.click_add_qualification()

        self.select_by_id("UserToCertificates_certificate_id", visible_text="SIA Badge", required=True)
        self.fill_by_id("UserToCertificates_certificate_number", clean(badge_number), required=True)

        if expiry_date:
            # Parim's pasted HTML has a strange generated ID:
            # add_certificate_exadd_certificate_expiry_datepiry_date
            self.fill_qualification_expiry_date(expiry_date)

        self.click_submit_in_form("add-user-certificate-dialog-form", "Save")
        self.wait_for_qualification_saved("SIA Badge", clean(badge_number))
        logging.info("SIA Badge qualification saved successfully")

    def fill_qualification_expiry_date(self, expiry_date: str) -> None:
        """Fill the qualification expiry date using robust selectors."""
        expiry_date = normalise_date(expiry_date)
        if not expiry_date:
            return

        result = self.driver.execute_script(
            """
            const value = arguments[0];
            const selectors = [
                '#add_certificate_exadd_certificate_expiry_datepiry_date',
                '#UserToCertificates_expiry_date',
                'input[name="UserToCertificates[expiry_date]"]',
                'input[id*="certificate"][id*="expiry" i]',
                'input[name*="expiry_date" i]'
            ];

            let el = null;
            let selectorUsed = '';

            for (const selector of selectors) {
                el = document.querySelector(selector);
                if (el) {
                    selectorUsed = selector;
                    break;
                }
            }

            if (!el) {
                return {ok:false, message:'Qualification expiry date field not found'};
            }

            el.scrollIntoView({block:'center', inline:'nearest'});
            el.removeAttribute('readonly');
            el.removeAttribute('disabled');
            el.focus();

            const proto = window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            if (setter) setter.call(el, value);
            else el.value = value;

            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));

            return {ok:true, selector:selectorUsed, value:el.value};
            """,
            expiry_date,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not fill SIA Expiry Date"))

        actual = clean(result.get("value", ""))
        if actual != expiry_date:
            raise RuntimeError(f"SIA Expiry Date did not keep value. Expected '{expiry_date}', got '{actual}'.")

        logging.info("Filled SIA Expiry Date via %s = %s", result.get("selector"), expiry_date)

    def wait_for_qualification_saved(self, certificate_name: str, certificate_number: str) -> None:
        """Wait until the qualification dialog closes or the SIA certificate appears in the cards."""
        logging.info("Waiting for qualification save confirmation")
        expected_name = clean(certificate_name).lower()
        expected_number = clean(certificate_number).lower()

        def condition(_driver):
            errors = self.get_visible_errors()
            if errors:
                return "ERROR:" + errors

            return self.driver.execute_script(
                """
                const expectedName = arguments[0];
                const expectedNumber = arguments[1];

                const cardsText = (document.querySelector('.certificates-row')?.innerText || '').toLowerCase();
                if (cardsText && cardsText.includes(expectedName) && (!expectedNumber || cardsText.includes(expectedNumber))) {
                    return 'saved';
                }

                const form = document.getElementById('add-user-certificate-dialog-form');
                const dialog = document.getElementById('add-user-certificate-dialog');

                const formVisible = form && !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
                const dialogVisible = dialog && !!(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length);

                if (!formVisible && !dialogVisible) {
                    return 'saved';
                }

                return '';
                """,
                expected_name,
                expected_number,
            ) or False

        try:
            result = self.wait.until(condition)
        except TimeoutException:
            self.save_debug_page("qualification_save_timeout")
            raise TimeoutException("Timeout waiting for qualification save confirmation. Saved debug files in output/debug.")

        if isinstance(result, str) and result.startswith("ERROR:"):
            raise RuntimeError(result.replace("ERROR:", "", 1))

    def add_generic_qualification(
        self,
        profile_url: str,
        qualification_name: str,
        certificate_number: str,
        expiry_date: str = "",
    ) -> None:
        """
        Generic Parim qualification creator.

        It opens the Expertise tab, clicks Qualifications > Add,
        selects the requested qualification by visible text,
        fills Certificate Number and optional Expiry Date, then saves.
        """
        qualification_name = clean(qualification_name)
        certificate_number = clean(certificate_number)
        expiry_date = normalise_date(expiry_date)

        if not qualification_name:
            raise RuntimeError("Qualification name is empty.")
        if not certificate_number:
            raise RuntimeError(f"Certificate number is empty for qualification: {qualification_name}")

        logging.info(
            "Adding qualification: %s | Certificate Number=%s | Expiry=%s",
            qualification_name,
            certificate_number,
            expiry_date,
        )

        self.open_expertise_tab(profile_url)
        self.click_add_qualification()

        self.select_by_id("UserToCertificates_certificate_id", visible_text=qualification_name, required=True)
        self.fill_by_id("UserToCertificates_certificate_number", certificate_number, required=True)

        if expiry_date:
            self.fill_qualification_expiry_date(expiry_date)

        self.click_submit_in_form("add-user-certificate-dialog-form", "Save")
        self.wait_for_qualification_saved(qualification_name, certificate_number)
        logging.info("%s qualification saved successfully", qualification_name)

    def row_has_drivers_licence_qualification_data(self, row: dict[str, Any]) -> bool:
        """
        Return True when Drivers Licence should be added as a qualification.

        Required sheet columns:
        - Drivers Licence      = certificate/licence number
        - Drivers Licence Date = expiry date, optional but recommended

        It will skip old negative values such as No, N/A, --.
        """
        licence_number = get(row, "Drivers Licence", "Drivers License", "Driving Licence", "Driving License")
        return has_real_value(licence_number)

    def add_drivers_licence_qualification(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Add Drivers license qualification from Google Sheet.

        Sheet mapping:
        - Qualification       = Drivers license
        - Certificate Number  = Drivers Licence
        - Expiry Date         = Drivers Licence Date

        Note:
        Parim's dropdown option in the supplied HTML is written as:
        "Drivers license"
        """
        if not self.row_has_drivers_licence_qualification_data(row):
            logging.info("Drivers Licence is empty or negative. Skipping Drivers license qualification step.")
            return

        licence_number = get(row, "Drivers Licence", "Drivers License", "Driving Licence", "Driving License")
        expiry_date = get(
            row,
            "Drivers Licence Date",
            "Drivers License Date",
            "Driving Licence Date",
            "Driving License Date",
            "Drivers Licence Expiry Date",
            "Drivers License Expiry Date",
        )

        self.add_generic_qualification(
            profile_url=profile_url,
            qualification_name="Drivers license",
            certificate_number=licence_number,
            expiry_date=expiry_date,
        )

    def row_has_document_folder_link(self, row: dict[str, Any]) -> bool:
        """Return True when a OneDrive documents folder link exists in the sheet."""
        link = get(
            row,
            "Documents Folder Link",
            "Document Folder Link",
            "Docs Folder Link",
            "OneDrive Folder Link",
            "OneDrive Documents Folder",
            "Documents Link",
        )
        return bool(clean(link))

    def open_docs_tab(self, profile_url: str) -> None:
        """Open created profile and switch to Docs tab."""
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot upload documents because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening profile Docs tab: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        self.wait_for_id("yw1", "profile tabs")

        result = self.driver.execute_script(
            """
            const tabLink = document.querySelector('a[href="#docs"]');
            const docsPanel = document.getElementById('docs');

            if (!tabLink || !docsPanel) {
                return {ok:false, message:'Docs tab or #docs panel not found'};
            }

            tabLink.scrollIntoView({block:'center', inline:'nearest'});
            tabLink.click();

            // Fallback for old jQuery UI tabs.
            document.querySelectorAll('.ui-tabs-panel').forEach(panel => {
                if (panel.id === 'docs') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            });

            const li = tabLink.closest('li');
            if (li) {
                document.querySelectorAll('#yw1 .ui-tabs-nav li').forEach(x => {
                    x.classList.remove('ui-tabs-selected', 'ui-state-active');
                });
                li.classList.add('ui-tabs-selected', 'ui-state-active');
            }

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not open Docs tab"))

        self.wait_for_id("document-upload-header", "Document upload header")
        self.wait_for_id("documents-list", "Documents list")
        logging.info("Docs tab is ready")

    def find_or_prepare_document_file_input(self):
        """
        Find Dropzone/fileupload input[type=file] for Parim document upload.

        Parim often creates a hidden input after clicking Add Document / Dropzone area.
        Selenium can send_keys to a hidden file input after we reveal it with JS.
        """
        result = self.driver.execute_script(
            """
            function reveal(el) {
                if (!el) return null;
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.height = '1px';
                el.style.width = '1px';
                el.style.position = 'fixed';
                el.style.left = '0px';
                el.style.top = '0px';
                el.removeAttribute('disabled');
                return el;
            }

            let input = document.querySelector('#docs input[type="file"], input[type="file"].dz-hidden-input, input[type="file"]');

            if (!input) {
                const addButton = document.querySelector('#add-document, .fileinput-button, #parim-uploadyw0, .parim-upload');
                if (addButton) {
                    addButton.scrollIntoView({block:'center', inline:'nearest'});
                    addButton.click();
                }
            }

            input = document.querySelector('#docs input[type="file"], input[type="file"].dz-hidden-input, input[type="file"]');

            if (!input) {
                return {ok:false, message:'Document file input was not created/found after clicking Add Document'};
            }

            reveal(input);

            if (!input.id) {
                input.id = 'parim_document_upload_input_runtime';
            }

            return {ok:true, id:input.id};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not find document file input"))

        return self.wait_for_id(result.get("id"), "Document file input")

    def upload_single_document_to_parim(self, file_path: Path) -> str:
        """
        Upload one document file to Parim Docs tab.

        Fix:
        - Reopens/prepares a fresh file input for every file.
        - Clears old upload queue if OneDrive/Parim left a previous file behind.
        - Accepts several successful states, but returns the state for notes.
        """
        file_path = Path(file_path).resolve()
        ok, reason = is_allowed_document_file(file_path)
        if not ok:
            raise RuntimeError(f"Invalid document {file_path.name}: {reason}")

        logging.info("Uploading document: %s", file_path.name)

        before_text = clean(
            self.driver.execute_script(
                "return (document.querySelector('#documents-list')?.innerText || '').trim();"
            )
        )

        # Try to reset any old hidden file inputs/queue state before choosing the next file.
        self.driver.execute_script(
            """
            document.querySelectorAll('input[type="file"]').forEach((el, idx) => {
                try { el.value = ''; } catch(e) {}
                if (idx > 0 && el.classList.contains('dz-hidden-input')) {
                    try { el.remove(); } catch(e) {}
                }
            });
            """
        )

        file_input = self.find_or_prepare_document_file_input()
        file_input.send_keys(str(file_path))

        logging.info("Waiting for document to be queued: %s", file_path.name)
        try:
            WebDriverWait(self.driver, 25).until(
                lambda _d: self.driver.execute_script(
                    """
                    const fileName = arguments[0].toLowerCase();
                    const body = (document.body.innerText || '').toLowerCase();
                    const startBtn = document.querySelector('#start-upload');
                    const startReady = startBtn && !startBtn.classList.contains('disabled') && !startBtn.disabled;
                    return body.includes(fileName) || startReady;
                    """,
                    file_path.name,
                )
            )
        except TimeoutException:
            self.save_debug_page("document_queue_timeout")
            raise TimeoutException(f"Timeout waiting for document to queue: {file_path.name}")

        result = self.driver.execute_script(
            """
            const btn = document.querySelector('#start-upload');
            if (!btn) {
                return {ok:false, message:'Start upload button #start-upload not found'};
            }

            btn.scrollIntoView({block:'center', inline:'nearest'});
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
            btn.click();

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Start upload"))

        logging.info("Clicked Start upload for: %s", file_path.name)

        upload_state = ""
        try:
            upload_state = WebDriverWait(self.driver, 60).until(
                lambda _d: self.driver.execute_script(
                    """
                    const fileName = arguments[0].toLowerCase();
                    const beforeText = arguments[1] || '';
                    const listText = (document.querySelector('#documents-list')?.innerText || '').toLowerCase();
                    const bodyText = (document.body.innerText || '').toLowerCase();

                    if (listText.includes(fileName)) return 'listed';
                    if (listText && listText !== beforeText.toLowerCase() && !listText.includes('no results found')) return 'list_changed';

                    const errors = Array.from(document.querySelectorAll('.errorMessage, .alert-error, .alert-danger, [role="alert"]'))
                        .filter(e => {
                            const txt = (e.textContent || '').trim();
                            if (!txt) return false;
                            const st = window.getComputedStyle(e);
                            return st.display !== 'none' && st.visibility !== 'hidden';
                        })
                        .map(e => e.textContent.trim())
                        .join(' | ');

                    if (errors) return 'ERROR:' + errors;

                    const startBtn = document.querySelector('#start-upload');
                    const startDisabled = startBtn && (startBtn.classList.contains('disabled') || startBtn.disabled);
                    const uploading = bodyText.includes('uploading') || bodyText.includes('processing');

                    if (startDisabled && !uploading) return 'queue_finished';

                    return '';
                    """,
                    file_path.name,
                    before_text,
                )
            )
        except TimeoutException:
            self.save_debug_page("document_upload_slow_warning")
            self.add_note(f"Document {file_path.name} upload may have completed, but confirmation was slow. Moving to next file.")
            return "slow_confirmation"

        if isinstance(upload_state, str) and upload_state.startswith("ERROR:"):
            raise RuntimeError(upload_state.replace("ERROR:", "", 1))

        logging.info("Document upload completed or queued finished: %s | state=%s", file_path.name, upload_state)

        if upload_state == "queue_finished":
            self.add_note(f"Document {file_path.name} upload queue finished. Parim grid may refresh later.")

        # Small pause lets Parim reset the upload widget before next document.
        time.sleep(0.6)
        return str(upload_state or "unknown")


    def wait_for_browser_download(self, before_files: set[str], timeout_seconds: int = 180) -> Path:
        """
        Wait for Chrome to finish downloading a new file into self.document_download_dir.

        This supports OneDrive folder ZIP downloads triggered by Selenium.
        """
        download_dir = self.document_download_dir
        deadline = time.time() + timeout_seconds
        last_candidate: Path | None = None
        last_size = -1
        stable_ticks = 0

        while time.time() < deadline:
            partials = list(download_dir.glob("*.crdownload")) + list(download_dir.glob("*.tmp"))
            candidates = [
                p for p in download_dir.iterdir()
                if p.is_file()
                and p.name not in before_files
                and not p.name.endswith(".crdownload")
                and not p.name.endswith(".tmp")
            ]

            if candidates:
                candidate = max(candidates, key=lambda p: p.stat().st_mtime)
                size = candidate.stat().st_size

                if partials:
                    time.sleep(1)
                    continue

                if last_candidate == candidate and size == last_size and size > 0:
                    stable_ticks += 1
                else:
                    stable_ticks = 0
                    last_candidate = candidate
                    last_size = size

                if stable_ticks >= 2:
                    return candidate

            time.sleep(1)

        raise TimeoutException(f"Timeout waiting for browser download in {download_dir}")

    def normalise_document_folder_name_for_match(self, value: str) -> str:
        """
        Normalise folder/person names for safe comparison.

        Examples that match:
        - Shobhan Reddy Aadur
        - Shobhan_Reddy_Aadur
        - Shobhan-Reddy-Aadur
        - shobhan reddy aadur
        """
        value = clean(value).lower()
        value = re.sub(r"[^a-z0-9]+", " ", value)
        value = re.sub(r"\s+", " ", value).strip()
        return value

    def expected_documents_folder_name_from_row(self, row: dict[str, Any]) -> str:
        """
        Expected OneDrive ZIP folder name.

        Security rule:
        folder inside ZIP must match:
        First Name + Last Name

        Uses sheet columns:
        - First Name (compulsory)
        - Last Name (compulsory)
        """
        first_name = get(row, "First Name (compulsory)", "First Name")
        last_name = get(row, "Last Name (compulsory)", "Last Name")

        expected = f"{clean(first_name)} {clean(last_name)}".strip()

        # Fallback only if first/last are not available for some reason.
        if not expected:
            expected = clean(get(row, "Full name", "Full Name"))

        return expected

    def validate_onedrive_zip_top_folder(self, extract_dir: Path) -> tuple[bool, str, str]:
        """
        Validate the top-level folder inside the extracted OneDrive ZIP.

        Returns:
        - ok
        - expected folder name
        - actual folder name/details

        If this fails, the script must not upload profile photo or documents.
        """
        expected_raw = clean(getattr(self, "current_expected_documents_folder_name", ""))
        expected_norm = self.normalise_document_folder_name_for_match(expected_raw)

        if not expected_norm:
            return False, expected_raw, "Expected folder name is empty because First Name/Last Name could not be read."

        extract_dir = Path(extract_dir)

        top_dirs = sorted([p for p in extract_dir.iterdir() if p.is_dir()], key=lambda p: p.name.lower())
        top_files = sorted([p for p in extract_dir.iterdir() if p.is_file()], key=lambda p: p.name.lower())

        if len(top_dirs) == 1 and not top_files:
            actual_raw = top_dirs[0].name
            actual_norm = self.normalise_document_folder_name_for_match(actual_raw)

            if actual_norm == expected_norm:
                return True, expected_raw, actual_raw

            return False, expected_raw, actual_raw

        if len(top_dirs) == 1 and top_files:
            actual_raw = f"{top_dirs[0].name} plus {len(top_files)} top-level file(s)"
            actual_norm = self.normalise_document_folder_name_for_match(top_dirs[0].name)

            if actual_norm == expected_norm:
                return True, expected_raw, actual_raw

            return False, expected_raw, actual_raw

        if len(top_dirs) > 1:
            actual_raw = "Multiple folders found: " + ", ".join(p.name for p in top_dirs)
            return False, expected_raw, actual_raw

        if top_files and not top_dirs:
            actual_raw = "No folder found inside ZIP. Top-level files: " + ", ".join(p.name for p in top_files[:10])
            return False, expected_raw, actual_raw

        return False, expected_raw, "No folder or files found inside ZIP."


    def collect_valid_documents_from_downloaded_path(self, downloaded_path: Path, dest_dir: Path) -> tuple[list[Path], list[str]]:
        """
        If the browser downloaded a ZIP, extract it and return every valid file inside it.

        Fix:
        - OneDrive ZIP usually contains a main folder, then files inside that folder.
        - This method scans recursively through all folders inside the ZIP.
        - It adds notes for every skipped file, so the sheet tells you why a file was not uploaded.
        """
        notes: list[str] = []
        valid_files: list[Path] = []

        downloaded_path = Path(downloaded_path)

        candidate_files: list[Path] = []

        if zipfile.is_zipfile(downloaded_path):
            extract_dir = dest_dir / ("browser_extracted_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
            extract_dir.mkdir(parents=True, exist_ok=True)

            with zipfile.ZipFile(downloaded_path, "r") as zf:
                zf.extractall(extract_dir)

            notes.append(f"Extracted OneDrive ZIP: {downloaded_path.name}")

            folder_ok, expected_folder, actual_folder = self.validate_onedrive_zip_top_folder(extract_dir)

            if not folder_ok:
                notes.append(
                    "WRONG DOCUMENTS FOLDER - upload skipped for safety. "
                    f"Expected folder: {expected_folder or '[missing First Name/Last Name]'} | "
                    f"Found: {actual_folder}. "
                    "No profile photo or paperwork was uploaded from this folder."
                )
                return [], notes

            notes.append(f"Folder security check passed. Expected: {expected_folder} | Found: {actual_folder}")

            for path in extract_dir.rglob("*"):
                if path.is_file():
                    candidate_files.append(path)
        else:
            candidate_files.append(downloaded_path)

        # Sort so upload order is stable and no file is missed due to filesystem order.
        candidate_files = sorted(candidate_files, key=lambda p: p.name.lower())

        notes.append(f"Documents found in download/extracted ZIP: {len(candidate_files)}")

        for path in candidate_files:
            ok, reason = is_allowed_document_file(path)
            if ok:
                valid_files.append(path)
            else:
                notes.append(f"Skipped document {path.name}: {reason}")

        valid_files = sorted(valid_files, key=lambda p: p.name.lower())
        notes.append("Valid files prepared for upload: " + (", ".join(p.name for p in valid_files) if valid_files else "none"))

        return valid_files, notes

    def download_onedrive_documents_with_browser(self, folder_url: str, dest_root: Path) -> tuple[list[Path], list[str]]:
        """
        Fast browser download for SharePoint/OneDrive business folder links.

        This version does NOT waste time trying Microsoft Graph/API.
        It opens the OneDrive folder page and clicks the exact Download command:
        button[data-automationid="downloadCommand"] / button[data-id="download"]

        OneDrive downloads a ZIP. If the ZIP contains a folder, this script extracts it
        and collects all valid files inside the folder.
        """
        notes: list[str] = []
        folder_url = clean(folder_url)

        if not folder_url:
            return [], ["Documents Folder Link missing"]

        dest_root.mkdir(parents=True, exist_ok=True)
        before_files = {p.name for p in self.document_download_dir.iterdir() if p.is_file()}

        original_window = self.driver.current_window_handle
        existing_windows = set(self.driver.window_handles)

        try:
            self.driver.execute_script("window.open(arguments[0], '_blank');", folder_url)

            WebDriverWait(self.driver, 15).until(lambda d: len(set(d.window_handles) - existing_windows) >= 1)
            new_window = list(set(self.driver.window_handles) - existing_windows)[0]
            self.driver.switch_to.window(new_window)

            self.wait_document_ready()

            # Wait only for OneDrive's real Download command, not long API fallbacks.
            logging.info("Waiting for OneDrive Download button")
            try:
                WebDriverWait(self.driver, 35).until(
                    lambda _d: self.driver.execute_script(
                        """
                        const btn = document.querySelector(
                            'button[data-automationid="downloadCommand"], button[data-id="download"], [data-automationid="commandbar-primary"] button[data-id="download"]'
                        );
                        return !!btn;
                        """
                    )
                )
            except TimeoutException:
                self.save_debug_page("onedrive_download_button_missing")
                return [], ["OneDrive Download button not found within 35 seconds. Check sharing/login or page load."]

            result = self.driver.execute_script(
                """
                function visible(el) {
                    if (!el) return false;
                    const st = window.getComputedStyle(el);
                    return st.display !== 'none' && st.visibility !== 'hidden' &&
                        !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                }

                let btn = document.querySelector(
                    'button[data-automationid="downloadCommand"], button[data-id="download"], [data-automationid="commandbar-primary"] button[data-id="download"]'
                );

                if (!btn) {
                    return {ok:false, message:'Exact Download button not found'};
                }

                btn.scrollIntoView({block:'center', inline:'nearest'});
                btn.removeAttribute('disabled');
                btn.click();

                return {
                    ok:true,
                    clicked: (btn.innerText || btn.getAttribute('aria-label') || btn.getAttribute('data-id') || 'Download').trim(),
                    visible: visible(btn)
                };
                """
            )

            if not result or not result.get("ok"):
                return [], [result.get("message", "Could not click OneDrive Download button") if result else "Could not click OneDrive Download button"]

            notes.append(f"Clicked OneDrive Download button directly: {result.get('clicked') or 'Download'}")

            downloaded_path = self.wait_for_browser_download(before_files, timeout_seconds=180)
            notes.append(f"Browser downloaded: {downloaded_path.name}")

            valid_files, validation_notes = self.collect_valid_documents_from_downloaded_path(downloaded_path, dest_root)
            notes.extend(validation_notes)

            return valid_files, notes

        except Exception as exc:
            return [], notes + [f"OneDrive browser direct download failed: {type(exc).__name__}: {exc}"]

        finally:
            try:
                current = self.driver.current_window_handle
                if current != original_window:
                    self.driver.close()
                self.driver.switch_to.window(original_window)
            except Exception:
                try:
                    self.driver.switch_to.window(original_window)
                except Exception:
                    pass


    def find_profile_picture_file(self, files: list[Path]) -> Path | None:
        """
        Find the profile picture from the downloaded OneDrive folder.

        Expected names:
        - Picture.jpeg
        - Picture.jpg
        - Picture.png
        - Picture.webp
        - Picture.heic
        """
        picture_extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

        for path in files:
            if path.is_file() and path.stem.strip().lower() == "picture" and path.suffix.lower() in picture_extensions:
                return path

        for path in files:
            if path.is_file() and "picture" in path.stem.strip().lower() and path.suffix.lower() in picture_extensions:
                return path

        return None

    def open_profile_photo_dialog(self, profile_url: str) -> None:
        """
        Open profile Details tab and click the user thumbnail to open Upload Photos dialog.
        """
        if not profile_url or "/admin/user/view?id=" not in profile_url:
            raise RuntimeError(f"Cannot upload profile photo because profile URL is missing or invalid: {profile_url}")

        logging.info("Opening profile for profile photo upload: %s", profile_url)
        self.driver.switch_to.default_content()
        self.driver.get(profile_url)
        self.wait_document_ready()

        logging.info("Waiting %s seconds for profile page to load", self.profile_wait)
        time.sleep(self.profile_wait)

        self.wait_for_id("yw1", "profile tabs")

        result = self.driver.execute_script(
            """
            const mainTab = document.querySelector('a[href="#main"]');
            if (mainTab) {
                mainTab.scrollIntoView({block:'center', inline:'nearest'});
                mainTab.click();
            }

            document.querySelectorAll('.ui-tabs-panel').forEach(panel => {
                if (panel.id === 'main') {
                    panel.classList.remove('ui-tabs-hide');
                    panel.style.display = '';
                }
            });

            const thumb = document.querySelector('a.userThumb');
            if (!thumb) {
                return {ok:false, message:'Profile photo thumbnail .userThumb not found'};
            }

            thumb.scrollIntoView({block:'center', inline:'nearest'});
            thumb.click();

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click profile photo thumbnail"))

        logging.info("Waiting for profile photo dialog")
        time.sleep(2)

        self.wait_for_id("parimDialog0", "Profile photo dialog")
        logging.info("Profile photo dialog is open")

    def find_or_prepare_profile_photo_input(self):
        """
        Find/create the hidden Dropzone file input for profile image upload.

        Fix:
        Parim/Dropzone usually appends the hidden file input to <body>, not inside
        #parimDialog0. Therefore we click Add file, then pick the newest global
        input[type=file], reveal it, and send_keys the Picture.* path.
        """
        before_ids = self.driver.execute_script(
            """
            return Array.from(document.querySelectorAll('input[type="file"]')).map((el, idx) => {
                if (!el.id) el.id = 'file_input_before_' + idx + '_' + Date.now();
                return el.id;
            });
            """
        ) or []

        result = self.driver.execute_script(
            """
            const dialog = document.querySelector('#parimDialog0, .parim-dialog-userImages');
            if (!dialog) {
                return {ok:false, message:'Profile photo dialog not found'};
            }

            const addFile = dialog.querySelector('.default-message-wrapper a, .default.message a, form.user-images-form, #test');
            if (addFile) {
                addFile.scrollIntoView({block:'center', inline:'nearest'});
                addFile.click();
            }

            return {ok:true};
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click Add file for profile photo"))

        # Wait briefly for Dropzone to create the hidden input.
        time.sleep(1)

        result = self.driver.execute_script(
            """
            const beforeIds = new Set(arguments[0] || []);

            function reveal(el) {
                if (!el) return null;
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.height = '1px';
                el.style.width = '1px';
                el.style.position = 'fixed';
                el.style.left = '0px';
                el.style.top = '0px';
                el.removeAttribute('disabled');
                return el;
            }

            let inputs = Array.from(document.querySelectorAll('input[type="file"]'));

            // Prefer newly created Dropzone input.
            let input = inputs.find(el => el.id && !beforeIds.has(el.id))
                || inputs[inputs.length - 1];

            if (!input) {
                return {ok:false, message:'Profile photo file input was not created/found after clicking Add file'};
            }

            reveal(input);

            if (!input.id) {
                input.id = 'parim_profile_photo_input_runtime_' + Date.now();
            }

            return {ok:true, id:input.id, count:inputs.length};
            """,
            before_ids,
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not find profile photo file input"))

        return self.wait_for_id(result.get("id"), "Profile photo file input")

    def wait_profile_photo_upload_ready(self, picture_name: str) -> None:
        """
        Wait until Parim's photo upload has had time to process.

        Parim sometimes leaves Done visually disabled even after the upload is ready.
        Therefore this waits for progress to stop, for preview/upload signs, or for a
        short stable period, then the caller force-enables Done.
        """
        logging.info("Waiting for profile photo upload processing: %s", picture_name)

        try:
            WebDriverWait(self.driver, 45).until(
                lambda _d: self.driver.execute_script(
                    """
                    const dialog = document.querySelector('#parimDialog0, .parim-dialog-userImages');
                    if (!dialog) return false;

                    const errors = Array.from(dialog.querySelectorAll('.errorMessage, .alert-error, .alert-danger, [role="alert"]'))
                        .filter(e => {
                            const txt = (e.textContent || '').trim();
                            if (!txt) return false;
                            const st = window.getComputedStyle(e);
                            return st.display !== 'none' && st.visibility !== 'hidden';
                        })
                        .map(e => e.textContent.trim())
                        .join(' | ');

                    if (errors) return 'ERROR:' + errors;

                    const progress = dialog.querySelector('.progress');
                    const uploading = progress && !progress.classList.contains('hide');

                    if (uploading) return false;

                    const text = (dialog.innerText || '').toLowerCase();
                    const hasPreview =
                        !!dialog.querySelector('img, canvas, .dz-preview, .dz-success, .dz-complete, .dz-image-preview') ||
                        text.includes('rotate right') ||
                        text.includes('rotate left');

                    const done = dialog.querySelector('.save-button, a.btn-success.save-button');

                    if (hasPreview || done) return 'ready';

                    return false;
                    """
                )
            )
        except TimeoutException:
            self.save_debug_page("profile_photo_upload_ready_timeout")
            self.add_note(f"Profile photo upload processing was slow for {picture_name}. Trying Done click anyway.")

    def click_profile_photo_done_force(self) -> None:
        """
        Click Done in the Upload images dialog.

        Fix:
        The HTML shows:
        <a href="#" class="btn btn-success save-button btn-small fr disabled">Done</a>

        Sometimes Parim keeps the disabled class even after the upload. This method
        removes disabled attributes/classes, fires mouse events and clicks Done.
        """
        result = self.driver.execute_script(
            """
            const dialog = document.querySelector('#parimDialog0, .parim-dialog-userImages');
            if (!dialog) {
                return {ok:false, message:'Profile photo dialog not found before Done click'};
            }

            const done = dialog.querySelector('a.btn-success.save-button, .save-button, a.btn-success');
            if (!done) {
                return {ok:false, message:'Profile photo Done button not found'};
            }

            done.classList.remove('disabled');
            done.removeAttribute('disabled');
            done.setAttribute('aria-disabled', 'false');
            done.style.pointerEvents = 'auto';

            done.scrollIntoView({block:'center', inline:'nearest'});
            done.focus();

            ['mouseover','mousedown','mouseup','click'].forEach(type => {
                done.dispatchEvent(new MouseEvent(type, {bubbles:true, cancelable:true, view:window}));
            });

            if (typeof done.click === 'function') {
                done.click();
            }

            return {
                ok:true,
                text:(done.innerText || done.textContent || '').trim(),
                className:done.className
            };
            """
        )

        if not result or not result.get("ok"):
            raise RuntimeError(result.get("message", "Could not click profile photo Done"))

        logging.info("Clicked profile photo Done: %s", result.get("text") or "Done")

        # Wait until dialog closes. If it remains open, save debug but do not instantly fail.
        try:
            WebDriverWait(self.driver, 15).until(
                lambda _d: self.driver.execute_script(
                    """
                    const dialog = document.querySelector('#parimDialog0, .parim-dialog-userImages');
                    if (!dialog) return true;
                    const st = window.getComputedStyle(dialog);
                    const visible = st.display !== 'none' && st.visibility !== 'hidden' &&
                        !!(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length);
                    return !visible;
                    """
                )
            )
        except TimeoutException:
            self.save_debug_page("profile_photo_done_dialog_still_open")
            self.add_note("Profile photo Done clicked, but dialog did not close within 15 seconds.")

    def upload_profile_photo_from_picture(self, profile_url: str, picture_path: Path) -> None:
        """
        Upload Picture.* as the user's profile photo before temporary files are deleted.
        """
        picture_path = Path(picture_path).resolve()

        if not picture_path.exists():
            raise RuntimeError(f"Profile picture file does not exist: {picture_path}")

        if picture_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
            raise RuntimeError(f"Profile picture file has unsupported image extension: {picture_path.name}")

        if picture_path.stat().st_size <= 0:
            raise RuntimeError(f"Profile picture file is empty: {picture_path.name}")

        logging.info("Uploading profile photo from: %s", picture_path.name)

        self.open_profile_photo_dialog(profile_url)

        file_input = self.find_or_prepare_profile_photo_input()
        file_input.send_keys(str(picture_path))

        self.wait_profile_photo_upload_ready(picture_path.name)
        self.click_profile_photo_done_force()

        time.sleep(2)
        logging.info("Profile photo upload flow completed: %s", picture_path.name)


    def upload_documents_from_onedrive_folder(self, profile_url: str, row: dict[str, Any]) -> None:
        """
        Download all files from a OneDrive shared folder link and upload them to Parim Docs.

        Fast mode:
        - No slow API/direct download attempt.
        - Opens the OneDrive folder in browser.
        - Clicks the exact Download command button.
        - Downloads the ZIP temporarily.
        - Extracts files from the folder inside the ZIP.
        - Uploads valid files to Parim.
        - Deletes temporary files after the upload attempt.
        """
        folder_link = get(
            row,
            "Documents Folder Link",
            "Document Folder Link",
            "Docs Folder Link",
            "OneDrive Folder Link",
            "OneDrive Documents Folder",
            "Documents Link",
        )

        if not clean(folder_link):
            logging.info("No Documents Folder Link found. Skipping document upload step.")
            return

        expected_folder_name = self.expected_documents_folder_name_from_row(row)
        self.current_expected_documents_folder_name = expected_folder_name

        if not clean(expected_folder_name):
            self.add_note(
                "Documents skipped for safety. Could not build expected folder name from First Name + Last Name."
            )
            return

        self.add_note(f"Documents: expected OneDrive ZIP folder name is {expected_folder_name}")

        temp_root = Path(tempfile.gettempdir()) / ("parim_document_uploads_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
        temp_root.mkdir(parents=True, exist_ok=True)

        files: list[Path] = []
        uploaded = 0
        failed = 0

        try:
            self.add_note("Documents: using fast browser download. Opening OneDrive and clicking Download directly.")
            files, browser_notes = self.download_onedrive_documents_with_browser(folder_link, temp_root)

            for note in browser_notes:
                self.add_note("Documents: " + note)

            if not files:
                self.add_note("Documents: no valid files found to upload after OneDrive browser download.")
                return

            files = sorted(files, key=lambda p: p.name.lower())
            logging.info("Prepared %s document(s) for Parim upload: %s", len(files), ", ".join(p.name for p in files))
            self.add_note(f"Documents: prepared {len(files)} file(s) for upload with original names: " + ", ".join(p.name for p in files))

            # Before deleting temporary files, upload Picture.* as the profile photo.
            picture_file = self.find_profile_picture_file(files)
            if picture_file:
                try:
                    self.upload_profile_photo_from_picture(profile_url, picture_file)
                    self.add_note(f"Profile photo uploaded from: {picture_file.name}")
                except Exception as exc:
                    self.add_note(f"Profile photo upload failed for {picture_file.name}: {type(exc).__name__}: {exc}")
                    self.save_debug_page("profile_photo_upload_failed")
            else:
                self.add_note("Profile photo: Picture.* file not found in downloaded documents.")

            self.open_docs_tab(profile_url)

            attempted_names: list[str] = []

            for file_path in files:
                attempted_names.append(file_path.name)
                try:
                    state = self.upload_single_document_to_parim(file_path)
                    uploaded += 1
                    self.add_note(f"Document uploaded/attempted: {file_path.name} ({state})")
                    time.sleep(0.4)
                except Exception as exc:
                    failed += 1
                    self.add_note(f"Document upload failed for {file_path.name}: {type(exc).__name__}: {exc}")
                    self.save_debug_page("document_upload_failed_" + re.sub(r"[^a-zA-Z0-9_]+", "_", file_path.stem.lower()))

                    # After a failed upload, reopen Docs tab to reset Parim's upload widget before next file.
                    try:
                        self.open_docs_tab(profile_url)
                    except Exception as reopen_exc:
                        self.add_note(f"Documents: could not reopen Docs tab after failed upload: {reopen_exc}")

            self.add_note(f"Documents upload summary: attempted {len(attempted_names)}, uploaded/attempted {uploaded}, failed {failed}, total valid {len(files)}")

        finally:
            # Always delete temporary downloaded/extracted documents after this row finishes.
            try:
                if temp_root.exists():
                    shutil.rmtree(temp_root, ignore_errors=True)
                self.add_note("Documents: temporary downloaded/extracted files deleted from PC.")
            except Exception as exc:
                self.add_note(f"Documents temp cleanup warning: {exc}")

            # Also remove finished browser downloads created by this run when possible.
            try:
                download_dir = getattr(self, "document_download_dir", None)
                if download_dir:
                    for path in Path(download_dir).glob("*"):
                        if path.is_file() and not path.name.endswith(".crdownload"):
                            path.unlink(missing_ok=True)
                    self.add_note("Documents: browser download folder cleaned.")
            except Exception as exc:
                self.add_note(f"Documents browser cleanup warning: {exc}")



    def create_one_user(self, row: dict[str, Any]) -> AutomationResult:
        person_email = get(row, "Email Address (compulsory)", "Email", "Email Address")
        self.step_notes = []

        try:
            # Core creation steps. These must succeed because no profile exists before them.
            self.open_create_page()
            self.fill_person_details(row)
            self.fill_contacts(row)
            profile_url = self.fill_personal_details(row)

            if profile_url:
                # Optional enrichment steps. Failures here are notes, not row-stopping errors.
                self.run_optional_step("Profile Title/Region/City Of Birth", self.update_profile_title_region_city_birth, profile_url, row)
                self.run_optional_step("Work Details UTR/Tax Code", self.add_work_details_utr_tax_code, profile_url, row)
                self.run_optional_step("Passport/ID-Card", self.add_passport_details, profile_url, row)
                self.run_optional_step("Emergency Contact", self.add_emergency_contact, profile_url, row)
                self.run_optional_step("Bank Details", self.add_bank_details, profile_url, row)
                self.run_optional_step("SIA Badge Qualification", self.add_sia_badge_qualification, profile_url, row)
                self.run_optional_step("Drivers Licence Qualification", self.add_drivers_licence_qualification, profile_url, row)
                self.run_optional_step("Documents Upload", self.upload_documents_from_onedrive_folder, profile_url, row)
            else:
                self.add_note("Profile created, but profile URL was not found. Extra details were skipped.")

            message = "Created successfully"
            if self.step_notes:
                message += ". Notes: " + " | ".join(self.step_notes)

            return AutomationResult(
                email=person_email,
                status="created",
                profile_url=profile_url,
                message=message,
                notes=list(self.step_notes),
            )
        except Exception as exc:
            screenshot = self.save_failure_screenshot(person_email)
            message = f"{type(exc).__name__}: {exc}"
            if self.step_notes:
                message += " | Notes before failure: " + " | ".join(self.step_notes)
            if screenshot:
                message += f" | screenshot: {screenshot}"
            logging.exception("Failed row: %s", person_email)
            return AutomationResult(
                email=person_email,
                status="failed",
                message=message,
                notes=list(self.step_notes),
            )

    def save_failure_screenshot(self, person_email: str) -> str:
        safe_email = re.sub(r"[^a-zA-Z0-9_.-]+", "_", person_email or "unknown")
        filename = self.screenshot_dir / f"failed_{safe_email}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

        try:
            self.driver.save_screenshot(str(filename))
            return str(filename)
        except WebDriverException:
            return ""


# ==================================================
# GOOGLE SHEETS IO
# ==================================================

def fetch_pending_sheet_rows(sheet_url: str, api_token: str, limit: int = 10) -> list[dict[str, Any]]:
    """
    Pull rows from Google Sheets Apps Script.
    Apps Script returns only rows where 'Parim Completed' is blank.
    """
    if not sheet_url:
        raise ValueError("Missing sheet_url. Pass --sheet-url or set PARIM_SHEET_URL.")
    if not api_token:
        raise ValueError("Missing api_token. Pass --api-token or set PARIM_API_TOKEN.")

    params = {
        "action": "pending",
        "token": api_token,
        "limit": str(limit),
    }

    logging.info("Fetching pending rows from Google Sheet")
    response = requests.get(sheet_url, params=params, timeout=45)
    response.raise_for_status()

    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(f"Sheet API error: {data.get('error') or data}")

    rows = data.get("rows", [])
    logging.info("Loaded %s pending row(s) from Google Sheet", len(rows))
    return rows


def update_sheet_row_status(
    sheet_url: str,
    api_token: str,
    row_number: int,
    status: str,
    message: str = "",
    profile_url: str = "",
) -> None:
    """
    Write status back to the same Google Sheet row.
    """
    payload = {
        "action": "update",
        "token": api_token,
        "rowNumber": row_number,
        "status": status,
        "message": message[:450],
        "profileUrl": profile_url,
    }

    response = requests.post(sheet_url, json=payload, timeout=45)
    response.raise_for_status()

    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(f"Could not update sheet row {row_number}: {data.get('error') or data}")

    logging.info("Updated Google Sheet row %s as %s", row_number, status)


def write_results(results: Iterable[AutomationResult], output_dir: str | Path) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    result_file = output_dir / "results.csv"

    with result_file.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["email", "status", "profile_url", "message", "notes"])
        writer.writeheader()

        for result in results:
            writer.writerow(
                {
                    "email": result.email,
                    "status": result.status,
                    "profile_url": result.profile_url,
                    "message": result.message,
                    "notes": " | ".join(result.notes or []),
                }
            )

    return result_file


def configure_logging(output_dir: str | Path) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file = output_dir / "run.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create Parim users from Google Sheets.")

    parser.add_argument("--sheet-url", default=os.getenv("PARIM_SHEET_URL", "https://script.google.com/macros/s/AKfycby2giAVUpTjGr7FatLelRKen_eZEKVLxvkrC98oN0eleqCP6_DUIrPQlcXJ34LdURSqpg/exec"), help="Apps Script Web App URL.")
    parser.add_argument("--api-token", default=os.getenv("PARIM_API_TOKEN", "hd-parim-12345"), help="Token matching Apps Script API_TOKEN.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum pending rows to process in one run.")

    parser.add_argument("--email", default=os.getenv("PARIM_EMAIL", "afrazsajid55@gmail.com"), help="Parim login email.")
    parser.add_argument("--password", default=os.getenv("PARIM_PASSWORD", "Afraz123!"), help="Parim login password.")

    parser.add_argument("--headless", action="store_true", help="Run Chrome without showing the browser.")
    parser.add_argument("--keep-open", action="store_true", default=True, help="Keep browser open after run. Default is ON.")
    parser.add_argument("--close-browser", action="store_false", dest="keep_open", help="Close browser after run.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Selenium wait timeout in seconds.")
    parser.add_argument("--output", default="output", help="Output folder.")
    parser.add_argument("--page-wait", type=int, default=7, help="Seconds to wait after opening create-user URL.")
    parser.add_argument("--next-form-wait", type=int, default=5, help="Seconds to wait after Save & Next before filling the next form.")
    parser.add_argument("--profile-wait", type=int, default=5, help="Seconds to wait after opening the created profile page.")
    parser.add_argument("--passport-dialog-wait", type=int, default=3, help="Seconds to wait after clicking Passport/ID-Card Edit.")
    parser.add_argument("--bank-dialog-wait", type=int, default=3, help="Seconds to wait after clicking Bank Account Edit.")
    parser.add_argument("--qualification-dialog-wait", type=int, default=3, help="Seconds to wait after clicking Qualification Add.")

    parser.add_argument(
        "--staff-portal-default-on",
        action="store_true",
        help="Leave Staff Portal access ON by default. Default is OFF unless sheet says Yes.",
    )

    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    configure_logging(args.output)

    if not args.email or not args.password:
        print("Missing Parim login details. Set PARIM_EMAIL and PARIM_PASSWORD, or pass --email and --password.")
        return 2

    if not args.sheet_url or not args.api_token:
        print("Missing sheet settings. Set PARIM_SHEET_URL and PARIM_API_TOKEN, or pass --sheet-url and --api-token.")
        return 2

    rows = fetch_pending_sheet_rows(args.sheet_url, args.api_token, limit=args.limit)

    if not rows:
        logging.info("No pending rows found. All rows are already marked in 'Parim Completed'.")
        return 0

    bot = ParimUserCreator(
        email=args.email,
        password=args.password,
        headless=args.headless,
        timeout=args.timeout,
        keep_browser_open=args.keep_open,
        output_dir=args.output,
        staff_portal_default=args.staff_portal_default_on,
        page_wait=args.page_wait,
        next_form_wait=args.next_form_wait,
        profile_wait=args.profile_wait,
        passport_dialog_wait=args.passport_dialog_wait,
        bank_dialog_wait=args.bank_dialog_wait,
        qualification_dialog_wait=args.qualification_dialog_wait,
    )

    results: list[AutomationResult] = []

    try:
        bot.login()

        for index, row in enumerate(rows, start=1):
            row_number = int(row.get("_rowNumber") or row.get("rowNumber") or 0)
            person_email = get(row, "Email Address (compulsory)", "Email", "Email Address")

            if not row_number:
                logging.error("Skipping row without _rowNumber: %s", person_email)
                continue

            logging.info("Creating pending row %s/%s | Sheet row %s | %s", index, len(rows), row_number, person_email)

            result = bot.create_one_user(row)
            results.append(result)

            if result.status == "created":
                try:
                    update_sheet_row_status(
                        args.sheet_url,
                        args.api_token,
                        row_number=row_number,
                        status="Done",
                        message=result.message or "Created successfully",
                        profile_url=result.profile_url,
                    )
                except Exception as update_exc:
                    logging.exception("Created in Parim but failed to update Google Sheet row %s", row_number)
                    result.status = "created_sheet_update_failed"
                    result.message = f"Created in Parim but sheet update failed: {update_exc}"
            else:
                try:
                    update_sheet_row_status(
                        args.sheet_url,
                        args.api_token,
                        row_number=row_number,
                        status="Error",
                        message=result.message,
                        profile_url=result.profile_url,
                    )
                except Exception:
                    logging.exception("Failed to update Google Sheet error status for row %s", row_number)

            logging.info(
                "Result for %s: %s %s",
                person_email,
                result.status,
                result.message or result.profile_url,
            )

    finally:
        bot.close()

    result_file = write_results(results, args.output)

    created = sum(1 for r in results if r.status in {"created", "created_sheet_update_failed"})
    failed = sum(1 for r in results if r.status == "failed")

    logging.info("Finished. Created: %s | Failed: %s | Local Results: %s", created, failed, result_file)

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
