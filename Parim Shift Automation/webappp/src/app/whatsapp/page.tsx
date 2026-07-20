import { connection } from "next/server";
import { RefreshCcw, Send } from "lucide-react";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, Badge } from "@/src/components/ui/primitives";
import { checkHealth, getSessionStatus, openwaRuntimeStatus, validateApiKey } from "@/src/lib/openwa/client";
import { env } from "@/src/lib/env";

export default async function WhatsappPage() {
  await connection();
  const [health, key, session] = await Promise.all([checkHealth(), validateApiKey(), getSessionStatus().catch(() => null)]);
  const runtime = openwaRuntimeStatus();
  return (
    <>
      <PageHeading title="WhatsApp" description="OpenWA localhost connection, API-key validation, session state, webhook status and test messaging." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Connection Status</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <StatusRow label="OpenWA server" value={health.ok ? "Healthy" : "Unavailable"} tone={health.ok ? "good" : "bad"} />
            <StatusRow label="API key" value={key.valid ? `Valid (${key.role ?? "role unknown"})` : "Not valid"} tone={key.valid ? "good" : "bad"} />
            <StatusRow label="Configured session" value={env.OPENWA_SESSION_ID} tone="neutral" />
            <StatusRow label="Session state" value={session?.status ?? "Not found"} tone={session?.status === "ready" ? "good" : "bad"} />
            <StatusRow label="Circuit breaker" value={runtime.circuitOpen ? "Open" : "Closed"} tone={runtime.circuitOpen ? "bad" : "good"} />
            <StatusRow label="Last error" value={runtime.lastError ?? "None"} tone={runtime.lastError ? "bad" : "neutral"} />
            <Button type="button" className="w-full"><RefreshCcw className="size-4" /> Refresh Status</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Send Test Message</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input aria-label="Test recipient" placeholder="447700900123@c.us" />
            <Textarea aria-label="Test message" placeholder="Test message from H&D Shift Messenger" />
            <Button type="button"><Send className="size-4" /> Send Test</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "neutral" }) {
  const className = tone === "good" ? "border-emerald-800 text-emerald-300" : tone === "bad" ? "border-red-900 text-red-300" : "";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-400">{label}</span>
      <Badge className={className}>{value}</Badge>
    </div>
  );
}
