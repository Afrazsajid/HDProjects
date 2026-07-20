import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, EmptyState } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";
import { prisma } from "@/src/lib/prisma";
import { GoogleSheetSync } from "@/src/components/google-sheet-sync";

export default async function ImportsPage() {
  await connection();
  const batches = await prisma.importBatch.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  return (
    <>
      <PageHeading title="Imports" description="CSV, JSON and Google Sheet imports with dry-run preview, validation errors, duplicate detection and history." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>CSV Upload</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input aria-label="CSV file" type="file" accept=".csv,text/csv" />
            <Button type="button">Preview CSV</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Google Sheet Sync</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-400">
            <GoogleSheetSync />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>JSON Endpoint</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea readOnly value={'POST /api/imports/json\nHeader: X-Import-Secret\nBody: { "dryRun": true, "shifts": [...] }'} aria-label="JSON endpoint instructions" />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
        <CardContent>
          {batches.length ? (
            <DataTable
              headers={["Started", "Source", "Rows", "Imported", "Updated", "Errors"]}
              rows={batches.map((batch) => [
                batch.startedAt.toLocaleString("en-GB"),
                batch.source,
                batch.rowCount,
                batch.importedCount,
                batch.updatedCount,
                batch.errorCount,
              ])}
            />
          ) : <EmptyState title="No import history" body="Completed CSV, JSON and Google Sheet imports will appear here." />}
        </CardContent>
      </Card>
    </>
  );
}
