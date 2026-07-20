"use client";

import { useState, useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "./ui/primitives";

type SyncResult = {
  rowCount?: number;
  rawRowCount?: number;
  importedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  dryRun?: boolean;
  errors?: Array<{ row: number; error: string }>;
  parsedPreview?: Array<{
    person: string;
    phone: string;
    date: string;
    startTime: string;
    endTime: string;
    position: string;
    location: string;
  }>;
  error?: string;
};

export function GoogleSheetSync() {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(dryRun: boolean) {
    startTransition(async () => {
      const response = await fetch(`/api/imports/google-sheet?dryRun=${dryRun ? "true" : "false"}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as SyncResult;
      setResult(response.ok ? payload : { error: payload.error ?? "Google Sheet sync failed." });
    });
  }

  return (
    <div className="space-y-3">
      <p>Reads server-side credentials only. Default range: Daily Shifts!A:H.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => run(true)} disabled={isPending}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          {isPending ? "Running..." : "Run Dry Sync"}
        </Button>
        <Button type="button" onClick={() => run(false)} disabled={isPending} className="bg-[#171717] text-white hover:bg-[#222]">
          Import Sheet
        </Button>
      </div>

      {result ? (
        <div className="rounded-md border border-[#333] bg-[#080808] p-3 text-xs text-zinc-300">
          {result.error ? (
            <p className="text-red-300">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-white">
                {result.dryRun ? "Dry run" : "Import"} parsed {result.rowCount ?? 0} shifts from {result.rawRowCount ?? 0} sheet rows.
              </p>
              <p className="mt-1">
                Imported/valid: {result.importedCount ?? 0} · Updated: {result.updatedCount ?? 0} · Skipped: {result.skippedCount ?? 0}
              </p>
              {result.errors?.length ? (
                <div className="mt-2 text-red-300">
                  {result.errors.slice(0, 5).map((error) => (
                    <p key={`${error.row}-${error.error}`}>Row {error.row}: {error.error}</p>
                  ))}
                </div>
              ) : null}
              {result.parsedPreview?.length ? (
                <div className="mt-3 max-h-56 overflow-auto">
                  {result.parsedPreview.map((shift, index) => (
                    <div key={`${shift.person}-${shift.startTime}-${index}`} className="border-t border-[#222] py-2">
                      <span className="text-white">{shift.person}</span> · {shift.date} · {shift.startTime} - {shift.endTime} · {shift.position} · {shift.location}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
