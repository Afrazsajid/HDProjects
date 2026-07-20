import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, Button, Input } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";
import { SendNowManager } from "@/src/components/send-now-manager";
import { prisma } from "@/src/lib/prisma";
import { formatDisplayDateTime } from "@/src/lib/date-time";
import { getShiftDisplayStatus } from "@/src/lib/shifts/status";

export default async function MessagesPage() {
  await connection();
  const [messages, events, templatesRaw, workersRaw, locationsRaw, shiftsRaw] = await Promise.all([
    prisma.scheduledMessage.findMany({
      include: { worker: true, triggerRule: true, template: true, shift: { include: { location: true } } },
      orderBy: { dueAtUtc: "desc" },
      take: 150,
    }),
    prisma.messageEvent.findMany({
      where: { direction: "OUTBOUND" },
      include: { scheduledMessage: { include: { worker: true, template: true, triggerRule: true } }, shift: { include: { worker: true, location: true } } },
      orderBy: { occurredAt: "desc" },
      take: 150,
    }),
    prisma.messageTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { fullName: "asc" }, take: 500 }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.shift.findMany({ include: { worker: true, location: true }, orderBy: { startAtUtc: "asc" }, take: 500 }),
  ]);
  const templates = templatesRaw.map((template) => ({ id: template.id, name: template.name, content: template.content, active: template.active }));
  const workers = workersRaw.map((worker) => ({ id: worker.id, fullName: worker.fullName, phoneE164: worker.phoneE164, active: worker.active }));
  const locations = locationsRaw.map((location) => ({ id: location.id, name: location.name }));
  const shifts = shiftsRaw.map((shift) => ({
    id: shift.id,
    startAtUtc: shift.startAtUtc.toISOString(),
    endAtUtc: shift.endAtUtc.toISOString(),
    status: getShiftDisplayStatus(shift),
    worker: { id: shift.worker.id, fullName: shift.worker.fullName, phoneE164: shift.worker.phoneE164, active: shift.worker.active },
    location: { id: shift.location.id, name: shift.location.name },
  }));
  return (
    <>
      <PageHeading title="Messages" description="Send immediate messages, review upcoming schedules and audit WhatsApp delivery logs." />
      <SendNowManager templates={templates} workers={workers} locations={locations} shifts={shifts} />
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Upcoming and Scheduled Messages</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Search messages" placeholder="Search worker, rule or failure" />
            <Button type="button">Bulk Retry Failures</Button>
          </div>
        </CardHeader>
        <CardContent>
          {messages.length ? (
            <DataTable
              headers={["Due", "Worker", "Rule", "Location", "Status", "Last Error"]}
              rows={messages.map((message) => [
                formatDisplayDateTime(message.dueAtUtc),
                message.worker.fullName,
                message.triggerRule.name,
                message.shift.location.name,
                <Badge key={message.id}>{message.status}</Badge>,
                message.lastError ?? "None",
              ])}
            />
          ) : <EmptyState title="No scheduled messages" body="Enable trigger rules and rebuild future messages." />}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>Message Log</CardTitle></CardHeader>
        <CardContent>
          {events.length ? (
            <DataTable
              headers={["Actual send time", "Recipient", "Phone / Chat", "Template", "Rule", "Shift and location", "Status"]}
              rows={events.map((event) => [
                formatDisplayDateTime(event.occurredAt),
                event.scheduledMessage?.worker.fullName ?? event.shift?.worker.fullName ?? "Direct message",
                event.whatsappChatId,
                event.scheduledMessage?.template.name ?? "Send now",
                event.scheduledMessage?.triggerRule.name ?? "Manual send",
                event.shift ? `${event.shift.location.name} - ${event.shift.startTimeLocal}-${event.shift.endTimeLocal}` : "No shift selected",
                <Badge key={event.id}>{event.eventType}</Badge>,
              ])}
            />
          ) : <EmptyState title="No message log yet" body="Sent scheduled and manual messages will appear here." />}
        </CardContent>
      </Card>
    </>
  );
}
