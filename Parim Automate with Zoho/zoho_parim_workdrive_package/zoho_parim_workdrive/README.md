# H&D Recruitment. Sheet1 to PARiM Sheet2 with Zoho WorkDrive folder link

## Files

- `Code.gs`: Google Apps Script Web App. Reads `sheet1` and writes `sheet2`.
- `transform_sheet1_to_parim.py`: Python script. Transforms rows and resolves Zoho WorkDrive file links to parent folder links.
- `.env.example`: Rename to `.env` and fill your values.

## Google Apps Script setup

1. Open your Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste `Code.gs`.
4. Change `API_TOKEN` to a long private token.
5. Deploy > New deployment > Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Copy the `/exec` Web App URL into `.env` as `GOOGLE_SCRIPT_URL`.

## Python setup

```cmd
pip install requests python-dotenv
```

Rename `.env.example` to `.env`, fill the values, then run:

```cmd
python transform_sheet1_to_parim.py
```

## Notes

- This version overwrites `sheet2` every run.
- It scans the document columns for a Zoho WorkDrive file link.
- If it finds a file link, it calls Zoho WorkDrive API and writes the parent folder link into `Documents Folder Link`.
- Existing Zoho permissions remain private. This does not create public links.
