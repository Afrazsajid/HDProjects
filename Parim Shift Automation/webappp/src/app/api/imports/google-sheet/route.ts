import { readConfiguredSheetRows } from "@/src/lib/google-sheets/client";
import { parseDailySectionRows } from "@/src/lib/google-sheets/parser";
import { importNormalisedShifts } from "@/src/lib/imports";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") !== "false";

  try {
    const rows = await readConfiguredSheetRows();
    const shifts = parseDailySectionRows(rows);
    const result = await importNormalisedShifts("GOOGLE_SHEET", shifts, dryRun);
    return Response.json({
      ...result,
      parsedPreview: shifts.slice(0, 20),
      rawRowCount: rows.length,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  url.searchParams.set("dryRun", "false");
  return GET(new Request(url, request));
}
