import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("ZOHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN")

ACCOUNTS_DOMAIN = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.com")
API_DOMAIN = os.getenv("ZOHO_API_DOMAIN", "https://www.zohoapis.com")
PARENT_FOLDER_ID = os.getenv("ZOHO_PARENT_FOLDER_ID")

PAGE_LIMIT = 50


def get_access_token():
    url = f"{ACCOUNTS_DOMAIN}/oauth/v2/token"

    payload = {
        "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token"
    }

    response = requests.post(url, data=payload)

    if not response.ok:
        print("Access token error:")
        print(response.status_code)
        print(response.text)
        sys.exit(1)

    return response.json()["access_token"]


def list_folder_items(access_token):
    all_items = []
    offset = 0

    headers = {
        "Authorization": f"Zoho-oauthtoken {access_token}",
        "Accept": "application/vnd.api+json"
    }

    while True:
        url = f"{API_DOMAIN}/workdrive/api/v1/files/{PARENT_FOLDER_ID}/files"

        params = {
            "page[limit]": PAGE_LIMIT,
            "page[offset]": offset
        }

        response = requests.get(url, headers=headers, params=params)

        if not response.ok:
            print("Folder listing error:")
            print(response.status_code)
            print(response.text)
            sys.exit(1)

        items = response.json().get("data", [])
        all_items.extend(items)

        if len(items) < PAGE_LIMIT:
            break

        offset += PAGE_LIMIT

    return all_items


def is_folder(item):
    attributes = item.get("attributes", {})

    return (
        attributes.get("is_folder") is True
        or attributes.get("resource_type") == 1001
        or str(attributes.get("type", "")).lower() == "folder"
    )


def get_name(item):
    attributes = item.get("attributes", {})

    return (
        attributes.get("name")
        or attributes.get("display_attr_name")
        or "Unknown folder"
    )


def get_link(item):
    attributes = item.get("attributes", {})
    item_id = item.get("id", "")

    return (
        attributes.get("permalink")
        or attributes.get("web_url")
        or attributes.get("link")
        or f"https://workdrive.zoho.com/folder/{item_id}"
    )


access_token = get_access_token()
items = list_folder_items(access_token)

folders = [item for item in items if is_folder(item)]

print(f"Total folders found: {len(folders)}\n")

for folder in folders:
    print(f"{get_name(folder)} -> {get_link(folder)}")