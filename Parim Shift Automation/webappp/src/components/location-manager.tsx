"use client";

import { Pause, Play, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea } from "@/src/components/ui/primitives";
import { DataTable } from "@/src/components/data-table";

type Location = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  timezone: string;
  active: boolean;
  upcomingCount: number;
};

export function LocationManager({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ name: "", address: "", postcode: "", timezone: "Europe/London", notes: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const filtered = useMemo(() => locations.filter((location) => [location.name, location.postcode, location.address].join(" ").toLowerCase().includes(query.toLowerCase())), [locations, query]);

  async function createLocation() {
    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Location could not be saved.");
      return;
    }
    setDraft({ name: "", address: "", postcode: "", timezone: "Europe/London", notes: "" });
    setMessage("Location saved.");
    startTransition(() => router.refresh());
  }

  async function toggleLocation(location: Location) {
    await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: location.id, active: !location.active }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Create Location</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <Input placeholder="Location name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input placeholder="Postcode" value={draft.postcode} onChange={(event) => setDraft({ ...draft, postcode: event.target.value })} />
          <Input placeholder="Timezone" value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} />
          <Button type="button" disabled={isPending} onClick={createLocation}><Save className="size-4" aria-hidden="true" /> Save location</Button>
          <div className="lg:col-span-4">
            <Textarea placeholder="Address and notes" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
          </div>
          {message ? <p className="lg:col-span-4 rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Locations</CardTitle>
          <Input aria-label="Search locations" placeholder="Search locations" value={query} onChange={(event) => setQuery(event.target.value)} className="sm:max-w-xs" />
        </CardHeader>
        <CardContent>
          {filtered.length ? (
            <DataTable
              headers={["Name", "Postcode", "Timezone", "Upcoming / active shifts", "Status", "Actions"]}
              rows={filtered.map((location) => [
                location.name,
                location.postcode ?? "Not set",
                location.timezone,
                location.upcomingCount,
                <Badge key={`${location.id}-status`}>{location.active ? "Active" : "Inactive"}</Badge>,
                <button key={`${location.id}-toggle`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333]" aria-label={`${location.active ? "Deactivate" : "Activate"} ${location.name}`} onClick={() => toggleLocation(location)}>
                  {location.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>,
              ])}
            />
          ) : <EmptyState title="No locations" body="Create a location manually or import shifts from Google Sheets." />}
        </CardContent>
      </Card>
    </div>
  );
}
