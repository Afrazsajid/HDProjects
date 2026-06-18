import os
import re
import sys
import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

from datetime import datetime

load_dotenv()

GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL", "").strip()
GOOGLE_SCRIPT_TOKEN = os.getenv("GOOGLE_SCRIPT_TOKEN", "").strip()

ZOHO_CLIENT_ID = os.getenv("ZOHO_CLIENT_ID", "").strip()
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET", "").strip()
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN", "").strip()

# Your sample WorkDrive URL is workdrive.zoho.eu, so EU is the default here.
ZOHO_ACCOUNTS_DOMAIN = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.eu").rstrip("/")
ZOHO_API_DOMAIN = os.getenv("ZOHO_API_DOMAIN", "https://www.zohoapis.eu").rstrip("/")
ZOHO_WORKDRIVE_WEB_DOMAIN = os.getenv("ZOHO_WORKDRIVE_WEB_DOMAIN", "https://workdrive.zoho.eu").rstrip("/")

PARIM_HEADERS = [
    "Email Address (compulsory)",
    "First Name (compulsory)",
    "Last Name (compulsory)",
    "Full name",
    "Gender",
    "Title",
    "Date of Birth",
    "Nationality",
    "NI / Social Security number",
    "Tax Code",
    "UTR",
    "Department",
    "Mobile (enter ' then 0.)",
    "Landline",
    "ID No.",
    "Country",
    "City/ Town",
    "Street Name",
    "House No.",
    "Apartment No.",
    "Postcode",
    "County",
    "Contract No",
    "Contract Start",
    "Contract End",
    "Employment Type",
    "Passport / ID Card Document No",
    "Issuing Country",
    "Expiry Date",
    "Date of Issue",
    "Visa Expiry",
    "Visa Description",
    "Drivers Licence",
    "Drivers Licence Date",
    "Access to Car",
    "Account Number",
    "Sort Code",
    "SIA Badge",
    "SIA Badge Number",
    "SIA Expiry Date",
    "Emergency Contact Name",
    "Emergency Contact Last Name",
    "Emergency Phone No",
    "Emergency Relation to user",
    "Documents Folder Link",
    "Parim Completed",
    "Parim Message",
    "Parim Profile URL",
    "Parim Updated At",
]

DOCUMENT_COLUMNS = [
    "Document Folder Link",
    "NI Letter",
    "Picture",
    "Passport",
    "Proof of Address",
    "Share Code",
    "SIA Badge Front",
    "SIA Badge Back",
    "ACT Awareness Certificate (Blue)",
    "ACT Security Certificate (Red)",
    "DBS Certificate",
    "First Aid Certificate",
    "UTR Letter / UTR Reference Letter",
    "Driving License Front",
    "Driving License Back",
    "Other Certifications",
    "Resume",
    "Term Letter",
    "Terms and Conditions",
    "Signature",
]

UK_POSTCODE_RE = re.compile(
    r"^([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|GIR\s*0AA)$",
    re.IGNORECASE,
)

URL_RE = re.compile(r"https?://[^\s,]+", re.IGNORECASE)


def die(message: str) -> None:
    print(message)
    sys.exit(1)


def require_env(name: str, value: str) -> None:
    if not value:
        die(f"Missing .env value: {name}")


def get_pending_source_data() -> Tuple[List[str], List[List[Any]], List[int]]:
    require_env("GOOGLE_SCRIPT_URL", GOOGLE_SCRIPT_URL)
    require_env("GOOGLE_SCRIPT_TOKEN", GOOGLE_SCRIPT_TOKEN)

    response = requests.get(
        GOOGLE_SCRIPT_URL,
        params={"token": GOOGLE_SCRIPT_TOKEN, "action": "readPendingSource"},
        timeout=60,
    )
    response.raise_for_status()

    payload = response.json()

    if not payload.get("ok"):
        die(f"Apps Script read error: {payload.get('error')}")

    data = payload.get("data", {})
    return data.get("headers", []), data.get("rows", []), data.get("rowNumbers", [])


def append_target_data(rows: List[List[Any]]) -> None:
    response = requests.post(
        GOOGLE_SCRIPT_URL,
        params={"token": GOOGLE_SCRIPT_TOKEN, "action": "appendTarget"},
        json={"headers": PARIM_HEADERS, "rows": rows},
        timeout=120,
    )
    response.raise_for_status()

    payload = response.json()

    if not payload.get("ok"):
        die(f"Apps Script append error: {payload.get('error')}")

    result = payload.get("data", {})
    print(
        f"Appended to target spreadsheet. Rows: {result.get('rowsWritten')}, "
        f"Columns: {result.get('columnsWritten')}, "
        f"Target tab: {result.get('targetSheetName')}"
    )


def mark_source_rows_done(row_numbers: List[int]) -> None:
    if not row_numbers:
        print("No source rows to mark as Done.")
        return

    response = requests.post(
        GOOGLE_SCRIPT_URL,
        params={"token": GOOGLE_SCRIPT_TOKEN, "action": "markSourceDone"},
        json={"rowNumbers": row_numbers},
        timeout=120,
    )
    response.raise_for_status()

    payload = response.json()

    if not payload.get("ok"):
        die(f"Apps Script mark Done error: {payload.get('error')}")

    result = payload.get("data", {})
    print(
        f"Marked source rows as Done: {result.get('rowsMarked')} "
        f"in column: {result.get('statusColumnName')}"
    )


def build_index(headers: List[str]) -> Dict[str, List[int]]:
    index: Dict[str, List[int]] = {}

    for i, header in enumerate(headers):
        key = str(header or "").strip()
        if key:
            index.setdefault(key, []).append(i)

    return index


def cell(row: List[Any], index: Dict[str, List[int]], header: str) -> str:
    positions = index.get(header, [])

    # If there are duplicate headers, return the first non-empty value.
    for pos in positions:
        if pos < len(row):
            value = row[pos]
            text = "" if value is None else str(value).strip()
            if text:
                return text

    return ""


def normalise_date(value: str) -> str:
    value = (value or "").strip()

    if not value:
        return ""

    try:
        # Handles:
        # 2026-06-09T00:00:00.000Z
        dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
        return dt.strftime("%d-%m-%Y")
    except:
        pass

    try:
        # Handles:
        # 2026-06-09
        dt = datetime.strptime(value, "%Y-%m-%d")
        return dt.strftime("%d-%m-%Y")
    except:
        pass

    try:
        # Handles:
        # 09-Jun-2026
        dt = datetime.strptime(value, "%d-%b-%Y")
        return dt.strftime("%d-%m-%Y")
    except:
        pass

    return value
def split_name(full_name: str) -> Tuple[str, str, str]:
    full_name = " ".join((full_name or "").replace("\n", " ").split()).strip()

    if not full_name:
        return "", "", ""

    # Handles values like: Danish, Jamal
    if "," in full_name:
        left, right = [part.strip() for part in full_name.split(",", 1)]
        first = right
        last = left
        clean_full = " ".join(part for part in [first, last] if part)
        return first, last, clean_full

    parts = full_name.split()

    if len(parts) == 1:
        return parts[0], "", parts[0]

    first = parts[0]
    last = " ".join(parts[1:])
    return first, last, f"{first} {last}".strip()


def split_emergency_name(full_name: str) -> Tuple[str, str]:
    first, last, _ = split_name(full_name)
    return first, last


def is_uk_postcode(value: str) -> bool:
    return bool(UK_POSTCODE_RE.match((value or "").strip()))


def normalise_mobile(value: str) -> str:
    raw = re.sub(r"[^0-9+]", "", value or "")

    if not raw:
        return ""

    if raw.startswith("+44"):
        raw = "0" + raw[3:]
    elif raw.startswith("44") and len(raw) >= 11:
        raw = "0" + raw[2:]
    elif raw.startswith("0"):
        pass

    # PARiM/Sheets instruction says enter apostrophe then 0 to preserve leading zero.
    if raw.startswith("0"):
        return "'" + raw

    return raw


def extract_first_url(text: str) -> str:
    match = URL_RE.search(text or "")
    return match.group(0).rstrip(")].,") if match else ""


def get_zoho_access_token() -> str:
    require_env("ZOHO_CLIENT_ID", ZOHO_CLIENT_ID)
    require_env("ZOHO_CLIENT_SECRET", ZOHO_CLIENT_SECRET)
    require_env("ZOHO_REFRESH_TOKEN", ZOHO_REFRESH_TOKEN)

    response = requests.post(
        f"{ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token",
        data={
            "refresh_token": ZOHO_REFRESH_TOKEN,
            "client_id": ZOHO_CLIENT_ID,
            "client_secret": ZOHO_CLIENT_SECRET,
            "grant_type": "refresh_token",
        },
        timeout=60,
    )

    if not response.ok:
        die(f"Zoho token error {response.status_code}: {response.text}")

    return response.json()["access_token"]


def zoho_headers(access_token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Zoho-oauthtoken {access_token}",
        "Accept": "application/vnd.api+json",
    }


def extract_workdrive_id(link: str) -> str:
    link = (link or "").strip()

    if not link:
        return ""

    parsed = urlparse(link)
    path = parsed.path.strip("/")
    parts = path.split("/")

    for marker in ["file", "folder", "folders"]:
        if marker in parts:
            pos = parts.index(marker)
            if pos + 1 < len(parts):
                return parts[pos + 1]

    return ""


def is_workdrive_folder_link(link: str) -> bool:
    lower = (link or "").lower()
    return "/folder/" in lower or "/folders/" in lower


def is_workdrive_file_link(link: str) -> bool:
    return "/file/" in (link or "").lower()


def get_workdrive_item(item_id: str, access_token: str) -> Optional[Dict[str, Any]]:
    if not item_id:
        return None

    url = f"{ZOHO_API_DOMAIN}/workdrive/api/v1/files/{item_id}"
    response = requests.get(url, headers=zoho_headers(access_token), timeout=60)

    if not response.ok:
        print(f"Warning: could not read WorkDrive item {item_id}: {response.status_code} {response.text}")
        return None

    return response.json().get("data")


def item_link(item: Optional[Dict[str, Any]], fallback_id: str = "") -> str:
    if not item:
        return f"{ZOHO_WORKDRIVE_WEB_DOMAIN}/folder/{fallback_id}" if fallback_id else ""

    attrs = item.get("attributes", {}) or {}

    return (
        attrs.get("permalink")
        or attrs.get("Permalink")
        or attrs.get("web_url")
        or attrs.get("link")
        or attrs.get("download_url")
        or (f"{ZOHO_WORKDRIVE_WEB_DOMAIN}/folder/{item.get('id', fallback_id)}" if (item.get("id") or fallback_id) else "")
    )


def find_parent_id_from_item(item: Optional[Dict[str, Any]]) -> str:
    if not item:
        return ""

    attrs = item.get("attributes", {}) or {}
    rel = item.get("relationships", {}) or {}

    candidates = [
        attrs.get("parent_id"),
        attrs.get("parentId"),
        attrs.get("parent"),
        attrs.get("parent_folder_id"),
        attrs.get("parentFolderId"),
    ]

    parent_data = rel.get("parent", {}).get("data") if isinstance(rel.get("parent"), dict) else None
    if isinstance(parent_data, dict):
        candidates.append(parent_data.get("id"))

    parents_data = rel.get("parents", {}).get("data") if isinstance(rel.get("parents"), dict) else None
    if isinstance(parents_data, list) and parents_data:
        first_parent = parents_data[0]
        if isinstance(first_parent, dict):
            candidates.append(first_parent.get("id"))

    for candidate in candidates:
        if isinstance(candidate, dict):
            candidate = candidate.get("id")
        candidate = str(candidate or "").strip()
        if candidate:
            return candidate

    return ""


def get_parent_folder_link_from_any_workdrive_link(link: str, access_token: str) -> str:
    link = extract_first_url(link)

    if not link:
        return ""

    # If the existing value is already a folder link, use it directly.
    if is_workdrive_folder_link(link):
        return link

    # If it is not a file link, do not try to convert it.
    if not is_workdrive_file_link(link):
        return ""

    file_id = extract_workdrive_id(link)

    if not file_id:
        return ""

    file_item = get_workdrive_item(file_id, access_token)
    parent_id = find_parent_id_from_item(file_item)

    if not parent_id:
        print(f"Warning: parent folder ID not found for file link: {link}")
        return ""

    parent_item = get_workdrive_item(parent_id, access_token)
    return item_link(parent_item, fallback_id=parent_id)


def find_documents_folder_link(row: List[Any], index: Dict[str, List[int]], access_token: str) -> str:
    # 1) Use existing folder link if it is already present.
    existing = cell(row, index, "Document Folder Link")
    existing_url = extract_first_url(existing)

    if existing_url and is_workdrive_folder_link(existing_url):
        return existing_url

    # 2) If Document Folder Link has a file link, convert it to parent folder link.
    if existing_url and is_workdrive_file_link(existing_url):
        folder_link = get_parent_folder_link_from_any_workdrive_link(existing_url, access_token)
        if folder_link:
            return folder_link

    # 3) Check all document upload columns and convert first file link to parent folder link.
    for column in DOCUMENT_COLUMNS:
        value = cell(row, index, column)
        url = extract_first_url(value)

        if not url:
            continue

        if is_workdrive_folder_link(url):
            return url

        if is_workdrive_file_link(url):
            folder_link = get_parent_folder_link_from_any_workdrive_link(url, access_token)
            if folder_link:
                return folder_link

    return ""


def split_address(address: str, postcode_candidate: str) -> Tuple[str, str, str]:
    address = " ".join((address or "").split()).strip()
    postcode_candidate = " ".join((postcode_candidate or "").split()).strip()

    postcode = postcode_candidate if is_uk_postcode(postcode_candidate) else ""

    # Some forms accidentally put the street address in Post Code.
    if not address and postcode_candidate and not postcode:
        address = postcode_candidate

    # Light split: house number at start, rest as street name.
    match = re.match(r"^(\d+[A-Za-z]?)\s+(.+)$", address)
    if match:
        house_no = match.group(1).strip()
        street = match.group(2).strip()
    else:
        house_no = ""
        street = address

    return street, house_no, postcode


def transform_row(row: List[Any], index: Dict[str, List[int]], access_token: str) -> List[str]:
    name = cell(row, index, "Name")
    first_name, last_name, full_name = split_name(name)

    emergency_first, emergency_last = split_emergency_name(cell(row, index, "Next of KIN Name"))

    street, house_no, postcode = split_address(
        address=cell(row, index, "Address"),
        postcode_candidate=cell(row, index, "Post Code"),
    )

    sia_badge_no = cell(row, index, "SIA Badge Number")

    values = {
        "Email Address (compulsory)": cell(row, index, "Email"),
        "First Name (compulsory)": first_name,
        "Last Name (compulsory)": last_name,
        "Full name": full_name,
        "Gender": cell(row, index, "Gender"),
        "Title": "",
        "Date of Birth": normalise_date(cell(row, index, "Date Of Birth")),
        "Nationality": cell(row, index, "Country of Birth"),
        "NI / Social Security number": cell(row, index, "NI No"),
        "Tax Code": "",
        "UTR": "",
        "Department": cell(row, index, "Position Applying For"),
        "Mobile (enter ' then 0.)": normalise_mobile(cell(row, index, "Phone")),
        "Landline": "",
        "ID No.": "",
        "Country": cell(row, index, "Country of Residence"),
        "City/ Town": cell(row, index, "City"),
        "Street Name": street,
        "House No.": house_no,
        "Apartment No.": "",
        "Postcode": postcode,
        "County": cell(row, index, "Region"),
        "Contract No": "",
        "Contract Start": "",
        "Contract End": "",
        "Employment Type": cell(row, index, "Employment Type"),
        "Passport / ID Card Document No": "",
        "Issuing Country": "",
        "Expiry Date": "",
        "Date of Issue": "",
        "Visa Expiry": "",
        "Visa Description": "",
        "Drivers Licence": cell(row, index, "Driving License Number"),
        "Drivers Licence Date": "",
        "Access to Car": "",
        "Account Number": cell(row, index, "Account Number"),
        "Sort Code": cell(row, index, "Sort Code"),
        "SIA Badge": "Yes" if sia_badge_no else "",
        "SIA Badge Number": sia_badge_no,
        "SIA Expiry Date": normalise_date(cell(row, index, "SIA Badge Expiry")),
        "Emergency Contact Name": emergency_first,
        "Emergency Contact Last Name": emergency_last,
        "Emergency Phone No": normalise_mobile(cell(row, index, "Next of KIN Number")),
        "Emergency Relation to user": cell(row, index, "Relation to you"),
        "Documents Folder Link": find_documents_folder_link(row, index, access_token),
        "Parim Completed": "",
        "Parim Message": cell(row, index, "Parim Message"),
        "Parim Profile URL": cell(row, index, "Parim Profile URL"),
        "Parim Updated At": cell(row, index, "Parim Updated At"),
    }

    return [values.get(header, "") for header in PARIM_HEADERS]


def main() -> None:
    print("Reading pending source rows from Apps Script...")
    headers, rows, row_numbers = get_pending_source_data()

    if not headers:
        die("No headers found in source sheet.")

    print(f"Pending source rows found: {len(rows)}")

    if not rows:
        print("No pending rows found. Nothing to transform.")
        return

    print("Getting Zoho WorkDrive access token...")
    access_token = get_zoho_access_token()

    index = build_index(headers)

    transformed_rows: List[List[str]] = []
    successful_source_row_numbers: List[int] = []

    for sheet_row_number, row in zip(row_numbers, rows):
        try:
            transformed_rows.append(transform_row(row, index, access_token))
            successful_source_row_numbers.append(int(sheet_row_number))
        except Exception as exc:
            print(f"Warning: source sheet row {sheet_row_number} failed: {exc}")

    if not transformed_rows:
        print("No rows were successfully transformed. Source sheet was not marked Done.")
        return

    print(f"Appending transformed rows to the target Google Sheet: {len(transformed_rows)}")
    append_target_data(transformed_rows)

    # Only mark rows Done after the target append succeeds.
    mark_source_rows_done(successful_source_row_numbers)

    print("Done.")


if __name__ == "__main__":
    main()
