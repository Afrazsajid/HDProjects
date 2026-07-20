import path from "node:path";
import { google } from "googleapis";
import { env } from "../env";

function resolveServiceAccountFile(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath);
}

export async function readConfiguredSheetRows() {
  if (!env.GOOGLE_SHEET_ID) {
    throw new Error("GOOGLE_SHEET_ID is not configured.");
  }

  const auth = env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? new google.auth.GoogleAuth({
        keyFile: resolveServiceAccountFile(env.GOOGLE_SERVICE_ACCOUNT_FILE),
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      })
    : new google.auth.GoogleAuth({
        credentials: {
          client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });

  if (!env.GOOGLE_SERVICE_ACCOUNT_FILE && (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY)) {
    throw new Error("Configure GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_EMAIL plus GOOGLE_PRIVATE_KEY.");
  }

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: env.GOOGLE_SHEET_RANGE,
    majorDimension: "ROWS",
  });

  return (response.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}
