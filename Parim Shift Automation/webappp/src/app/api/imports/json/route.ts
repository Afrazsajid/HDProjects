import { env } from "@/src/lib/env";
import { importNormalisedShifts } from "@/src/lib/imports";
import { jsonImportSchema } from "@/src/lib/validation";

export async function POST(request: Request) {
  const secret = request.headers.get("x-import-secret");
  if (!env.IMPORT_API_SECRET || secret !== env.IMPORT_API_SECRET) {
    return Response.json({ error: "Invalid import secret" }, { status: 401 });
  }
  const body = jsonImportSchema.parse(await request.json());
  const result = await importNormalisedShifts("JSON", body.shifts, body.dryRun);
  return Response.json(result);
}
