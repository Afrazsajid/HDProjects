import { AlertTriangle, CheckCircle2, Clock, MessageSquare, PauseIcon, Send, Users, Wifi } from "lucide-react";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";
import { getDashboardData } from "@/src/lib/dashboard";
import { formatDisplayTime } from "@/src/lib/date-time";
import { getShiftDisplayStatus } from "@/src/lib/shifts/status";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const metricCards = [
    { label: "Shifts Today", value: data.metrics.shiftsToday, icon: Clock },
    { label: "Workers Checked In", value: data.metrics.checkedInToday, icon: Users },
    { label: "Due Next Two Hours", value: data.metrics.dueSoon, icon: MessageSquare },
    { label: "Sent Today", value: data.metrics.sentToday, icon: Send },
    { label: "Failed Today", value: data.metrics.failedToday, icon: AlertTriangle },
    { label: "Pending Messages", value: data.metrics.pendingMessages, icon: CheckCircle2 },
    { label: "Active Rules", value: data.metrics.activeRules, icon: CheckCircle2 },
    { label: "Inactive Rules", value: data.metrics.inactiveRules, icon: PauseIcon },
    { label: "Repeating Rules", value: data.metrics.repeatingRules, icon: MessageSquare },
  ];

  return (
    <>
      <PageHeading title="Dashboard" description="Live operational view for shifts, WhatsApp delivery, attendance, imports and scheduler health." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-[#4a3b1b]">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">OpenWA Target</p>
              <p className="mt-1 font-mono text-lg text-white">localhost:2785</p>
            </div>
            <Wifi className="size-6 text-[#c8a45d]" aria-hidden="true" />
          </CardContent>
        </Card>
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">{metric.label}</p>
                  <p className="mt-1 text-3xl font-semibold text-white">{metric.value}</p>
                </div>
                <Icon className="size-6 text-[#c8a45d]" aria-hidden="true" />
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Timeline of Today&apos;s Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingShifts.length ? (
              <DataTable
                headers={["Time", "Worker", "Location", "Position", "Status"]}
                rows={data.upcomingShifts.map((shift) => [
                  `${formatDisplayTime(shift.startAtUtc)} - ${formatDisplayTime(shift.endAtUtc)}`,
                  shift.worker.fullName,
                  shift.location.name,
                  shift.position,
                  <Badge key={shift.id}>{getShiftDisplayStatus(shift)}</Badge>,
                ])}
              />
            ) : (
              <EmptyState title="No shifts today" body="Import a CSV, JSON payload, or Google Sheet to populate the timeline." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scheduler Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Lease owner</span>
              <span className="max-w-[14rem] truncate font-mono text-zinc-200">{data.lease?.ownerId ?? "No heartbeat yet"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Heartbeat</span>
              <span className="text-zinc-200">{data.lease?.heartbeatAt.toLocaleString("en-GB") ?? "Waiting for worker"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-400">Last import</span>
              <span className="text-zinc-200">{data.lastImport?.completedAt?.toLocaleString("en-GB") ?? "No completed import"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingMessages.length ? (
              <DataTable
                headers={["Due", "Worker", "Rule", "Location"]}
                rows={data.upcomingMessages.map((message) => [
                  message.dueAtUtc.toLocaleString("en-GB"),
                  message.worker.fullName,
                  message.triggerRule.name,
                  message.shift.location.name,
                ])}
              />
            ) : (
              <EmptyState title="No pending messages" body="Enable seeded rules or create a custom rule to generate scheduled messages." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest Inbound Replies</CardTitle>
          </CardHeader>
          <CardContent>
            {data.inboundReplies.length ? (
              <div className="space-y-3">
                {data.inboundReplies.map((reply) => (
                  <div key={reply.id} className="rounded-md border border-[#242424] p-3">
                    <p className="text-sm text-white">{reply.text}</p>
                    <p className="mt-1 text-xs text-zinc-500">{reply.whatsappChatId} · {reply.occurredAt.toLocaleString("en-GB")}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No inbound replies yet" body="OpenWA webhook events will appear here after workers respond." />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Rule Execution Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {data.rules.length ? (
            <DataTable
              headers={["Rule", "Template", "State", "Repeat", "Next scheduled message"]}
              rows={data.rules.map((rule) => [
                rule.name,
                rule.template.name,
                <Badge key={`${rule.id}-state`}>{rule.enabled ? "Active" : "Inactive"}</Badge>,
                rule.recurrenceIntervalMinutes ? `Every ${rule.recurrenceIntervalMinutes} minutes` : "Only once",
                rule.scheduledMessages[0]?.dueAtUtc.toLocaleString("en-GB") ?? "Nothing scheduled",
              ])}
            />
          ) : (
            <EmptyState title="No rules yet" body="Create a rule to see its next scheduled execution here." />
          )}
        </CardContent>
      </Card>
    </>
  );
}
