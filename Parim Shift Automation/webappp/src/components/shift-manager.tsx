"use client";

import { Copy, Save, Trash2, XCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";

type Worker = { id: string; fullName: string };
type Location = { id: string; name: string };
type Shift = {
  id: string;
  shiftDateLocal: string;
  startTimeLocal: string;
  endTimeLocal: string;
  position: string;
  department: string | null;
  status: string;
  storedStatus: string;
  worker: Worker;
  location: Location;
};

export function ShiftManager({ shifts, workers, locations }: { shifts: Shift[]; workers: Worker[]; locations: Location[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ workerIds: [] as string[], locationId: locations[0]?.id ?? "", date: "", startTime: "", endTime: "", position: "", department: "", notes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const filtered = useMemo(() => shifts.filter((shift) => [shift.worker.fullName, shift.location.name, shift.position, shift.status, shift.storedStatus].join(" ").toLowerCase().includes(query.toLowerCase())), [shifts, query]);

  function toggleWorker(id: string) {
    setDraft((current) => ({ ...current, workerIds: current.workerIds.includes(id) ? current.workerIds.filter((item) => item !== id) : [...current.workerIds, id] }));
  }

  async function createShift() {
    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; shifts?: Shift[] };
    if (!response.ok) {
      setMessage(data.error ?? "Shift could not be saved.");
      return;
    }
    setMessage(`Saved ${data.shifts?.length ?? 0} shift(s). Relevant messaging rules were applied.`);
    startTransition(() => router.refresh());
  }

  async function patchShift(id: string, body: Record<string, unknown>) {
    await fetch("/api/shifts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    startTransition(() => router.refresh());
  }

  async function deleteShift(id: string) {
    if (!window.confirm("Delete this shift and cancel pending messages for it?")) return;
    await fetch(`/api/shifts?id=${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  function copyShift(shift: Shift) {
    setDraft({
      workerIds: [shift.worker.id],
      locationId: shift.location.id,
      date: shift.shiftDateLocal,
      startTime: shift.startTimeLocal,
      endTime: shift.endTimeLocal,
      position: shift.position,
      department: shift.department ?? "",
      notes: "",
    });
    setMessage("Shift copied into the form. Change the date, time or workers, then save.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Create Shift</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Location</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Date</span>
              <Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Start</span>
              <Input placeholder="0500" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">End</span>
              <Input placeholder="0600" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Role</span>
              <Input placeholder="Patrol Driver" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Department" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
            <Textarea placeholder="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            <Button type="button" disabled={isPending} onClick={createShift}><Save className="size-4" aria-hidden="true" /> Save shift</Button>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-md border border-[#333] bg-[#080808] p-3">
            {workers.map((worker) => (
              <label key={worker.id} className="flex min-h-11 items-center gap-3 border-b border-[#181818] py-2 text-sm text-zinc-200 last:border-b-0">
                <input type="checkbox" checked={draft.workerIds.includes(worker.id)} onChange={() => toggleWorker(worker.id)} />
                <span>{worker.fullName}</span>
              </label>
            ))}
          </div>
          {message ? <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Shift List</CardTitle>
          <Input aria-label="Search shifts" placeholder="Search shifts" value={query} onChange={(event) => setQuery(event.target.value)} className="sm:max-w-xs" />
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <DataTable
              headers={["Date", "Time", "Person", "Location", "Role", "Status", "Actions"]}
              rows={filtered.map((shift) => [
                shift.shiftDateLocal,
                `${shift.startTimeLocal} - ${shift.endTimeLocal}`,
                shift.worker.fullName,
                shift.location.name,
                shift.position,
                <div key={`${shift.id}-status`} className="space-y-1">
                  <Badge>{shift.status}</Badge>
                  {shift.status !== shift.storedStatus ? <p className="text-xs text-zinc-500">Saved as {shift.storedStatus}</p> : null}
                </div>,
                <div key={`${shift.id}-actions`} className="flex gap-2">
                  <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333]" aria-label={`Copy shift for ${shift.worker.fullName}`} onClick={() => copyShift(shift)}><Copy className="size-4" /></button>
                  <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333] text-amber-200" aria-label={`Cancel shift for ${shift.worker.fullName}`} onClick={() => patchShift(shift.id, { status: "CANCELLED" })}><XCircle className="size-4" /></button>
                  <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333] text-red-300" aria-label={`Delete shift for ${shift.worker.fullName}`} onClick={() => deleteShift(shift.id)}><Trash2 className="size-4" /></button>
                </div>,
              ])}
            />
          ) : <EmptyState title="No shifts" body="Create a shift manually or import shifts from Google Sheets." />}
        </CardContent>
      </Card>
    </div>
  );
}
