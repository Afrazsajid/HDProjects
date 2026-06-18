import os
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("ZOHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
ACCOUNTS_DOMAIN = os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.eu")

grant_code = "1000.8a5213dcce0104cf66e45af82c877697.3a8ff8e4f69a0fe8260fafcb315c8f10"

url = f"{ACCOUNTS_DOMAIN}/oauth/v2/token"

payload = {
    "grant_type": "authorization_code",
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "code": grant_code
}

response = requests.post(url, data=payload)

print("Status:", response.status_code)
print(response.text)

if response.ok:
    data = response.json()
    print("\nYour refresh token is:")
    print(data.get("refresh_token"))