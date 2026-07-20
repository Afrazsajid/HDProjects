"use client";

import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input } from "@/src/components/ui/primitives";

type Template = { id: string; name: string; content: string; active: boolean };
type Worker = { id: string; fullName: string; phoneE164: string; active: boolean };
type Location = { id: string; name: string };
type Shift = { id: string; startAtUtc: string | Date; endAtUtc: string | Date; worker: Worker; location: Location; status: string };
type PreviewResult = { workerId: string; workerName: string; phone?: string; shiftId?: string; status: string; text?: string; error?: string };

const modes = [
  { value: "workers", label: "Selected workers" },
  { value: "location", label: "Workers at a location" },
  { value: "shift", label: "One specific shift" },
  { value: "startingSoon", label: "Shifts starting soon" },
  { value: "currentlyOnShift", label: "Workers currently on shift" },
  { value: "ended", label: "Shifts that have ended" },
  { value: "status", label: "Shift status" },
];

export function SendNowManager({ templates, workers, locations, shifts }: { templates: Template[]; workers: Worker[]; locations: Location[]; shifts: Shift[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [mode, setMode] = useState("workers");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [minutes, setMinutes] = useState("120");
  const [shiftStatus, setShiftStatus] = useState("");
  const [results, setResults] = useState<PreviewResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const template = useMemo(() => templates.find((item) => item.id === templateId), [templateId, templates]);

  function toggleWorker(id: string) {
    setWorkerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function run(dryRun: boolean) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/messages/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, mode, workerIds, locationId, shiftId, minutes, shiftStatus, dryRun }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; recipientCount?: number; results?: PreviewResult[] };
      if (!response.ok) {
        setMessage(data.error ?? "Send now failed.");
        return;
      }
      setResults(data.results ?? []);
      setMessage(dryRun ? `${data.recipientCount ?? 0} recipient(s) matched. Review the preview before sending.` : `Sent to ${data.recipientCount ?? 0} recipient(s).`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Send Message Now</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Template</span>
            <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Recipients</span>
            <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={mode} onChange={(event) => setMode(event.target.value)}>
              {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {["location", "startingSoon", "currentlyOnShift", "ended", "status"].includes(mode) ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Location</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Any location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
          ) : null}
          {mode === "shift" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Shift</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
                <option value="">Choose shift</option>
                {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.worker.fullName} - {shift.location.name}</option>)}
              </select>
            </label>
          ) : null}
          {mode === "startingSoon" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Starting within minutes</span>
              <Input type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
            </label>
          ) : null}
          {mode === "status" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Shift status</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={shiftStatus} onChange={(event) => setShiftStatus(event.target.value)}>
                <option value="">Choose status</option>
                {["UPCOMING", "ACTIVE", "ENDED", "SCHEDULED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {mode === "workers" ? (
          <div className="max-h-56 overflow-y-auto rounded-md border border-[#333] bg-[#080808] p-3">
            {workers.length ? workers.slice(0, 120).map((worker) => (
              <label key={worker.id} className="flex min-h-11 items-center gap-3 border-b border-[#181818] py-2 text-sm text-zinc-200 last:border-b-0">
                <input type="checkbox" checked={workerIds.includes(worker.id)} onChange={() => toggleWorker(worker.id)} />
                <span className="flex-1">{worker.fullName}</span>
                <span className="font-mono text-xs text-zinc-500">{worker.phoneE164}</span>
              </label>
            )) : <EmptyState title="No workers" body="Create or import workers before sending direct messages." />}
          </div>
        ) : null}
        <div className="rounded-md border border-[#333] bg-[#080808] p-4 text-sm text-zinc-300">
          <p className="font-medium text-white">Selected template</p>
          <p className="mt-1">{template?.content ?? "Choose a template."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={loading || !templateId} onClick={() => run(true)}>Preview recipients</Button>
          <Button type="button" disabled={loading || !results.some((result) => result.status === "PREVIEW")} className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => run(false)}>
            <Send className="size-4" aria-hidden="true" /> Send now
          </Button>
        </div>
        {message ? <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
        {results.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {results.slice(0, 8).map((result, index) => (
              <div key={`${result.workerId}-${index}`} className="rounded-md border border-[#2c2c2c] bg-[#0b0b0b] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-white">{result.workerName}</p>
                  <Badge>{result.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">{result.phone ?? result.error ?? "No phone"}</p>
                {result.text ? <p className="mt-3 text-sm leading-6 text-zinc-300">{result.text}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
