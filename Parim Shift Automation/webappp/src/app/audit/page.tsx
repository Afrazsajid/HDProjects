import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";
import { prisma } from "@/src/lib/prisma";

export default async function AuditPage() {
  await connection();
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeading title="Audit" description="System history for imports, rule changes, scheduled sends, manual check-ins and webhook actions." />
      <Card>
        <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
        <CardContent>
          {logs.length ? (
            <DataTable
              headers={["Time", "Actor", "Action", "Entity", "Metadata"]}
              rows={logs.map((log) => [
                log.createdAt.toLocaleString("en-GB"),
                log.actorType,
                log.action,
                `${log.entityType}${log.entityId ? ` ${log.entityId}` : ""}`,
                log.metadataJson ?? "",
              ])}
            />
          ) : <EmptyState title="No audit entries" body="Operational changes and inbound confirmations are written here." />}
        </CardContent>
      </Card>
    </>
  );
}
