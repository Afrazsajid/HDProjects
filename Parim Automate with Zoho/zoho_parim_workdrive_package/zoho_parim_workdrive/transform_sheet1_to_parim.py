"""
H&D Recruitment. Sheet1 to PARiM Sheet2 transformer

What this script does:
1) Reads rows from Google Sheet tab "sheet1" through Apps Script.
2) Transforms them into PARiM import format.
3) Finds any Zoho WorkDrive file link in the document columns.
4) Uses Zoho WorkDrive API to get the parent folder link of that file.
5) Writes transformed rows into Google Sheet tab "sheet2" through Apps Script.

Required .env values:
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
GOOGLE_SCRIPT_TOKEN=your_apps_script_token
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REFRESH_TOKEN=your_zoho_refresh_token
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.eu
ZOHO_API_DOMAIN=https://www.zohoapis.eu
ZOHO_WORKDRIVE_WEB_DOMAIN=https://workdrive.zoho.eu
"""

import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from dotenv import load_dotenv

load_dotenv()

GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL", "").strip()
GOOGLE_SCRIPT_TOKEN = os.getenv("GOOGLE_SCRIPT_TOKEN", "").strip()

ZOHO_CLIENT_ID = os.getenv("ZOHO_CLIENT_ID", "").strip()
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET", "").strip()
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN", "").strip()
ZOHO_ACCOUNTS_DOMAIN = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.eu").rstrip("/")
ZOHO_API_DOMAIN = os.getenv("ZOHO_API_DOMAIN", "https://www.zohoapis.eu").rstrip("/")
ZOHO_WORKDRIVE_WEB_DOMAIN = os.getenv("ZOHO_WORKDRIVE_WEB_DOMAIN", "https://workdrive.zoho.eu").rstrip("/")

REQUEST_TIMEOUT = 60

TARGET_HEADERS = [
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
    "Document Folder Link",
]

WORKDRIVE_URL_RE = re.compile(r"https?://[^\s\"'<>]*workdrive\.zoho\.[^\s\"'<>]+", re.IGNORECASE)
UK_POSTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b",
    re.IGNORECASE,
)

_file_to_folder_cache: Dict[str, str] = {}
_folder_detail_cache: Dict[str, str] = {}


def require_env(name: str, value: str) -> None:
    if not value:
        print(f"Missing .env value: {name}")
        sys.exit(1)


def normalise_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def first_non_empty(*values: Any) -> str:
    for value in values:
        text = normalise_space(value)
        if text:
            return text
    return ""


def get_source(row: Dict[str, Any], key: str) -> str:
    return normalise_space(row.get(key, ""))


def parse_name(full_name: str) -> Tuple[str, str, str]:
    name = normalise_space(full_name).replace(" ,", ",").replace(", ", ",")
    if not name:
        return "", "", ""

    if "," in name:
        parts = [normalise_space(p) for p in name.split(",") if normalise_space(p)]
        first = parts[0] if len(parts) >= 1 else ""
        last = parts[1] if len(parts) >= 2 else ""
    else:
        parts = name.split()
        first = parts[0] if parts else ""
        last = " ".join(parts[1:]) if len(parts) > 1 else ""

    full = normalise_space(f"{first} {last}") or normalise_space(full_name)
    return first, last, full


def format_date(value: Any) -> str:
    text = normalise_space(value)
    if not text:
        return ""

    formats = [
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y-%m-%d",
        "%d.%m.%Y",
        "%d %b %Y",
        "%d %B %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).strftime("%d/%m/%Y")
        except ValueError:
            pass

    return text


def normalise_mobile(value: Any) -> str:
    raw = normalise_space(value)
    if not raw:
        return ""

    digits = re.sub(r"\D+", "", raw)
    if not digits:
        return ""

    if digits.startswith("0044"):
        digits = "0" + digits[4:]
    elif digits.startswith("44") and len(digits) >= 11:
        digits = "0" + digits[2:]
    elif digits.startswith("7") and len(digits) == 10:
        digits = "0" + digits

    # PARiM/CSV safe format. The apostrophe protects the leading zero in Sheets/Excel.
    if digits.startswith("0"):
        return "'" + digits

    return "'" + digits


def find_uk_postcode(*values: Any) -> str:
    for value in values:
        text = normalise_space(value).upper()
        match = UK_POSTCODE_RE.search(text)
        if match:
            postcode = match.group(1).upper().replace(" ", "")
            return postcode[:-3] + " " + postcode[-3:]
    return ""


def parse_address(address: str, postcode: str = "") -> Tuple[str, str, str]:
    clean = normalise_space(address)
    if postcode:
        clean = re.sub(re.escape(postcode), "", clean, flags=re.IGNORECASE).strip(", ")
        clean = re.sub(re.escape(postcode.replace(" ", "")), "", clean, flags=re.IGNORECASE).strip(", ")

    house_no = ""
    street = clean
    apartment_no = ""

    match = re.match(r"^([A-Za-z0-9\-/]+)\s+(.*)$", clean)
    if match:
        house_no = match.group(1)
        street = match.group(2)

    return normalise_space(street), normalise_space(house_no), normalise_space(apartment_no)


def derive_department(position: str) -> str:
    p = position.lower()
    if not p:
        return ""

    security_keywords = ["security", "sia", "door", "cctv", "event steward", "steward", "event supervisor"]
    warehouse_keywords = ["warehouse", "picker", "packer", "forklift", "reach", "flexi", "van driver", "driver"]
    hospitality_keywords = [
        "housekeeper", "room attendant", "waiter", "waitress", "porter", "poter", "linen",
        "cleaner", "bar", "bartender", "concierge", "office admin", "hospitality",
    ]

    if any(k in p for k in security_keywords):
        return "Security"
    if any(k in p for k in warehouse_keywords):
        return "Warehouse"
    if any(k in p for k in hospitality_keywords):
        return "Hospitality"
    return ""


def yes_if(value: Any) -> str:
    return "Yes" if normalise_space(value) else ""


def extract_workdrive_urls(text: Any) -> List[str]:
    value = str(text or "")
    return [m.group(0).rstrip(").,;") for m in WORKDRIVE_URL_RE.finditer(value)]


def extract_item_id_from_workdrive_url(url: str) -> Tuple[str, str]:
    """Return (kind, item_id). kind can be file, folder, folders, or empty."""
    clean = url.split("?")[0].split("#")[0].rstrip("/")
    parts = [p for p in clean.split("/") if p]

    for marker in ("file", "folder", "folders"):
        if marker in parts:
            idx = parts.index(marker)
            if idx + 1 < len(parts):
                return marker, parts[idx + 1]

    return "", ""


def get_zoho_access_token() -> str:
    require_env("ZOHO_CLIENT_ID", ZOHO_CLIENT_ID)
    require_env("ZOHO_CLIENT_SECRET", ZOHO_CLIENT_SECRET)
    require_env("ZOHO_REFRESH_TOKEN", ZOHO_REFRESH_TOKEN)

    url = f"{ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token"
    payload = {
        "refresh_token": ZOHO_REFRESH_TOKEN,
        "client_id": ZOHO_CLIENT_ID,
        "client_secret": ZOHO_CLIENT_SECRET,
        "grant_type": "refresh_token",
    }
    response = requests.post(url, data=payload, timeout=REQUEST_TIMEOUT)
    if not response.ok:
        raise RuntimeError(f"Zoho token error {response.status_code}: {response.text}")
    return response.json()["access_token"]


def zoho_get(path: str, access_token: str) -> Dict[str, Any]:
    url = f"{ZOHO_API_DOMAIN}{path}"
    headers = {
        "Authorization": f"Zoho-oauthtoken {access_token}",
        "Accept": "application/vnd.api+json",
    }
    response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    if not response.ok:
        raise RuntimeError(f"Zoho GET error {response.status_code} for {url}: {response.text}")
    return response.json()


def extract_data_object(api_response: Dict[str, Any]) -> Dict[str, Any]:
    data = api_response.get("data", {})
    if isinstance(data, list):
        return data[0] if data else {}
    return data if isinstance(data, dict) else {}


def get_attr(item: Dict[str, Any], *keys: str) -> str:
    attrs = item.get("attributes", {}) if isinstance(item, dict) else {}
    for key in keys:
        value = attrs.get(key)
        if value:
            return normalise_space(value)
    return ""


def extract_parent_id_from_detail(detail: Dict[str, Any]) -> str:
    data = extract_data_object(detail)

    relationships = data.get("relationships", {}) if isinstance(data, dict) else {}
    for rel_key in ("parent", "parents", "folder", "parent_folder"):
        rel = relationships.get(rel_key, {})
        if isinstance(rel, dict):
            rel_data = rel.get("data", {})
            if isinstance(rel_data, dict) and rel_data.get("id"):
                return normalise_space(rel_data.get("id"))
            if isinstance(rel_data, list) and rel_data and isinstance(rel_data[0], dict) and rel_data[0].get("id"):
                return normalise_space(rel_data[0].get("id"))

    attrs = data.get("attributes", {}) if isinstance(data, dict) else {}
    possible_keys = [
        "parent_id",
        "parentId",
        "parent_folder_id",
        "parentFolderId",
        "folder_id",
        "folderId",
    ]
    for key in possible_keys:
        if attrs.get(key):
            return normalise_space(attrs.get(key))

    # Last-resort recursive scan for fields that look like a parent ID.
    def scan(obj: Any) -> str:
        if isinstance(obj, dict):
            for key, value in obj.items():
                key_lower = str(key).lower()
                if "parent" in key_lower and "id" in key_lower and isinstance(value, str) and value:
                    return normalise_space(value)
                found = scan(value)
                if found:
                    return found
        elif isinstance(obj, list):
            for value in obj:
                found = scan(value)
                if found:
                    return found
        return ""

    return scan(detail)


def folder_link_from_folder_id(folder_id: str, access_token: str) -> str:
    if not folder_id:
        return ""
    if folder_id in _folder_detail_cache:
        return _folder_detail_cache[folder_id]

    try:
        detail = zoho_get(f"/workdrive/api/v1/files/{folder_id}", access_token)
        folder_item = extract_data_object(detail)
        link = get_attr(folder_item, "permalink", "Permalink", "web_url", "webUrl", "link")
        if not link:
            link = f"{ZOHO_WORKDRIVE_WEB_DOMAIN}/folder/{folder_id}"
    except Exception:
        link = f"{ZOHO_WORKDRIVE_WEB_DOMAIN}/folder/{folder_id}"

    _folder_detail_cache[folder_id] = link
    return link


def folder_link_from_file_url(file_url: str, access_token: str) -> str:
    kind, item_id = extract_item_id_from_workdrive_url(file_url)
    if not item_id:
        return ""

    if kind in ("folder", "folders"):
        return file_url

    if item_id in _file_to_folder_cache:
        return _file_to_folder_cache[item_id]

    detail = zoho_get(f"/workdrive/api/v1/files/{item_id}", access_token)
    parent_id = extract_parent_id_from_detail(detail)

    link = folder_link_from_folder_id(parent_id, access_token) if parent_id else ""
    _file_to_folder_cache[item_id] = link
    return link


def find_any_document_folder_link(row: Dict[str, Any], access_token: Optional[str]) -> str:
    # If Sheet1 already has a folder link, prefer that.
    existing = get_source(row, "Document Folder Link")
    for url in extract_workdrive_urls(existing):
        kind, _ = extract_item_id_from_workdrive_url(url)
        if kind in ("folder", "folders"):
            return url

    # Scan known document/file columns.
    for col in DOCUMENT_COLUMNS:
        value = get_source(row, col)
        for url in extract_workdrive_urls(value):
            kind, _ = extract_item_id_from_workdrive_url(url)
            if kind in ("folder", "folders"):
                return url
            if access_token:
                try:
                    folder_link = folder_link_from_file_url(url, access_token)
                    if folder_link:
                        return folder_link
                except Exception as exc:
                    print(f"Warning. Could not resolve parent folder for {url}: {exc}")

    # Extra fallback. Scan whole row for WorkDrive links, but avoid Parim Profile URL.
    for key, value in row.items():
        if key == "Parim Profile URL":
            continue
        for url in extract_workdrive_urls(value):
            kind, _ = extract_item_id_from_workdrive_url(url)
            if kind in ("folder", "folders"):
                return url
            if access_token:
                try:
                    folder_link = folder_link_from_file_url(url, access_token)
                    if folder_link:
                        return folder_link
                except Exception as exc:
                    print(f"Warning. Could not resolve parent folder for {url}: {exc}")

    return ""


def transform_row(row: Dict[str, Any], access_token: Optional[str]) -> Dict[str, str]:
    source_name = get_source(row, "Name")
    first_name, last_name, full_name = parse_name(source_name)

    emergency_first, emergency_last, _ = parse_name(get_source(row, "Next of KIN Name"))

    address = first_non_empty(get_source(row, "Address"), get_source(row, "Post Code"))
    postcode = find_uk_postcode(get_source(row, "Post Code"), address)
    street, house_no, apartment_no = parse_address(address, postcode)

    position = get_source(row, "Position Applying For")
    sia_badge_number = get_source(row, "SIA Badge Number")
    sia_badge_links = first_non_empty(get_source(row, "SIA Badge Front"), get_source(row, "SIA Badge Back"))

    output = {header: "" for header in TARGET_HEADERS}

    output["Email Address (compulsory)"] = get_source(row, "Email")
    output["First Name (compulsory)"] = first_name
    output["Last Name (compulsory)"] = last_name
    output["Full name"] = full_name
    output["Gender"] = get_source(row, "Gender")
    output["Title"] = ""
    output["Date of Birth"] = format_date(get_source(row, "Date Of Birth"))
    output["Nationality"] = first_non_empty(get_source(row, "Country of Birth"), get_source(row, "Country of Residence"))
    output["NI / Social Security number"] = get_source(row, "NI No")
    output["Tax Code"] = ""
    output["UTR"] = ""
    output["Department"] = derive_department(position)
    output["Mobile (enter ' then 0.)"] = normalise_mobile(get_source(row, "Phone"))
    output["Landline"] = ""
    output["ID No."] = ""
    output["Country"] = get_source(row, "Country of Residence")
    output["City/ Town"] = first_non_empty(get_source(row, "City"), get_source(row, "Region"))
    output["Street Name"] = street
    output["House No."] = house_no
    output["Apartment No."] = apartment_no
    output["Postcode"] = postcode
    output["County"] = get_source(row, "Region")
    output["Contract No"] = ""
    output["Contract Start"] = ""
    output["Contract End"] = ""
    output["Employment Type"] = get_source(row, "Employment Type")
    output["Passport / ID Card Document No"] = ""
    output["Issuing Country"] = ""
    output["Expiry Date"] = ""
    output["Date of Issue"] = ""
    output["Visa Expiry"] = ""
    output["Visa Description"] = ""
    output["Drivers Licence"] = get_source(row, "Driving License Number")
    output["Drivers Licence Date"] = ""
    output["Access to Car"] = ""
    output["Account Number"] = get_source(row, "Account Number")
    output["Sort Code"] = get_source(row, "Sort Code")
    output["SIA Badge"] = "Yes" if sia_badge_number or sia_badge_links else ""
    output["SIA Badge Number"] = sia_badge_number
    output["SIA Expiry Date"] = format_date(get_source(row, "SIA Badge Expiry"))
    output["Emergency Contact Name"] = emergency_first
    output["Emergency Contact Last Name"] = emergency_last
    output["Emergency Phone No"] = normalise_mobile(get_source(row, "Next of KIN Number"))
    output["Emergency Relation to user"] = get_source(row, "Relation to you")
    output["Documents Folder Link"] = find_any_document_folder_link(row, access_token)
    output["Parim Completed"] = get_source(row, "Parim format complete")
    output["Parim Message"] = get_source(row, "Parim Message")
    output["Parim Profile URL"] = get_source(row, "Parim Profile URL")
    output["Parim Updated At"] = first_non_empty(get_source(row, "Parim Updated At"), get_source(row, "Parim Updated At__2"))

    return output


def apps_script_get(action: str) -> Dict[str, Any]:
    require_env("GOOGLE_SCRIPT_URL", GOOGLE_SCRIPT_URL)
    require_env("GOOGLE_SCRIPT_TOKEN", GOOGLE_SCRIPT_TOKEN)

    params = {"action": action, "token": GOOGLE_SCRIPT_TOKEN}
    response = requests.get(GOOGLE_SCRIPT_URL, params=params, timeout=REQUEST_TIMEOUT)
    if not response.ok:
        raise RuntimeError(f"Apps Script GET error {response.status_code}: {response.text}")

    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(f"Apps Script GET failed: {data}")
    return data


def apps_script_post(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    require_env("GOOGLE_SCRIPT_URL", GOOGLE_SCRIPT_URL)
    require_env("GOOGLE_SCRIPT_TOKEN", GOOGLE_SCRIPT_TOKEN)

    params = {"action": action, "token": GOOGLE_SCRIPT_TOKEN}
    response = requests.post(GOOGLE_SCRIPT_URL, params=params, json=payload, timeout=REQUEST_TIMEOUT)
    if not response.ok:
        raise RuntimeError(f"Apps Script POST error {response.status_code}: {response.text}")

    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(f"Apps Script POST failed: {data}")
    return data


def main() -> None:
    print("Reading sheet1 from Apps Script...")
    source_payload = apps_script_get("readSheet1")
    source_rows = source_payload.get("rows", [])
    print(f"Rows found in sheet1: {len(source_rows)}")

    print("Getting Zoho WorkDrive access token...")
    zoho_access_token = get_zoho_access_token()

    transformed_rows = []
    for row in source_rows:
        # Skip completely unusable rows.
        if not first_non_empty(row.get("Email"), row.get("Name"), row.get("Phone")):
            continue
        transformed_rows.append(transform_row(row, zoho_access_token))

    print(f"Writing transformed rows to sheet2: {len(transformed_rows)}")
    result = apps_script_post("writeSheet2", {"rows": transformed_rows})

    print("Done.")
    print(result)


if __name__ == "__main__":
    main()
