"use client";

import { Pause, Play, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";

type Worker = {
  id: string;
  fullName: string;
  phoneE164: string;
  rawPhone: string;
  position: string | null;
  department: string | null;
  active: boolean;
  whatsappOptIn: boolean;
  doNotContact: boolean;
  notes: string | null;
};

export function WorkerManager({ workers }: { workers: Worker[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ fullName: "", phone: "", position: "", department: "", notes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const filtered = useMemo(() => workers.filter((worker) => [worker.fullName, worker.phoneE164, worker.position, worker.department].join(" ").toLowerCase().includes(query.toLowerCase())), [workers, query]);

  async function createWorker() {
    const response = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Worker could not be saved.");
      return;
    }
    setDraft({ fullName: "", phone: "", position: "", department: "", notes: "" });
    setMessage("Worker saved.");
    startTransition(() => router.refresh());
  }

  async function patchWorker(id: string, body: Record<string, unknown>) {
    await fetch("/api/workers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Create Worker</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <Input placeholder="Worker name" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} />
          <Input placeholder="Phone number" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          <Input placeholder="Role" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} />
          <Input placeholder="Department" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
          <Button type="button" disabled={isPending} onClick={createWorker}><Save className="size-4" aria-hidden="true" /> Save worker</Button>
          <div className="lg:col-span-5">
            <Textarea placeholder="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </div>
          {message ? <p className="lg:col-span-5 rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Worker Directory</CardTitle>
          <Input aria-label="Search workers" placeholder="Search workers" value={query} onChange={(event) => setQuery(event.target.value)} className="sm:max-w-xs" />
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <DataTable
              headers={["Name", "Phone", "Role", "Department", "Status", "Actions"]}
              rows={filtered.map((worker) => [
                worker.fullName,
                worker.phoneE164,
                worker.position ?? "Not set",
                worker.department ?? "Not set",
                <Badge key={`${worker.id}-status`}>{worker.doNotContact ? "Do not contact" : worker.active ? "Active" : "Inactive"}</Badge>,
                <button key={`${worker.id}-toggle`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333]" aria-label={`${worker.active ? "Deactivate" : "Activate"} ${worker.fullName}`} onClick={() => patchWorker(worker.id, { active: !worker.active })}>
                  {worker.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>,
              ])}
            />
          ) : <EmptyState title="No workers" body="Create a worker manually or import shifts from Google Sheets." />}
        </CardContent>
      </Card>
    </div>
  );
}
