# H&D PARiM Pending Rows Only Automation

This version only processes rows from `sheet1` where the source column `Parim format complete` is not marked as `Done`.

## Flow

1. Apps Script reads only pending rows from the source Google Sheet.
2. Python transforms only those rows into the PARiM format.
3. Python appends the transformed rows to the target existing Google Sheet.
4. Only after the target append succeeds, Python marks the original source rows as `Done`.
5. Apps Script also updates `Parim Message` to `Formatted successfully` and updates all `Parim Updated At` columns if those headers exist.

## Files

- `Code.gs`: paste this into Apps Script and deploy as a Web App.
- `transform_pending_rows_to_parim.py`: run this Python file.
- `.env.example`: rename to `.env` and fill your credentials.

## Apps Script setup

In `Code.gs`, update:

```js
API_TOKEN: 'CHANGE_THIS_TO_A_LONG_SECRET_TOKEN_12345'
TARGET_SPREADSHEET_ID: 'PASTE_TARGET_GOOGLE_SHEET_ID_HERE'
TARGET_SHEET_NAME: 'sheet1'
```

Keep this source status column unless your source sheet header is different:

```js
STATUS_COLUMN_NAME: 'Parim format complete'
DONE_VALUE: 'Done'
```

Deploy as Web App:

- Execute as: Me
- Who has access: Anyone

Copy the `/exec` URL into `.env` as `GOOGLE_SCRIPT_URL`.

## Python setup

Install packages:

```cmd
pip install requests python-dotenv
```

Rename `.env.example` to `.env`, then fill:

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
GOOGLE_SCRIPT_TOKEN=your_same_apps_script_token
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REFRESH_TOKEN=your_zoho_refresh_token
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.eu
ZOHO_API_DOMAIN=https://www.zohoapis.eu
ZOHO_WORKDRIVE_WEB_DOMAIN=https://workdrive.zoho.eu
```

Run:

```cmd
python transform_pending_rows_to_parim.py
```

## Important

This version appends to the target sheet. It does not clear the target sheet every run.

If you already tested the old version and the target sheet has old duplicated data, clear the target sheet once manually before running this new version.
