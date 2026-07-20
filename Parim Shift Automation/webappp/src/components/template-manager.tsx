"use client";

import { Copy, Eye, Pause, Play, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea } from "@/src/components/ui/primitives";

type Template = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  active: boolean;
  systemTemplate: boolean;
  _count?: { triggerRules: number };
};

const sampleData: Record<string, string> = {
  firstName: "Ava",
  first_name: "Ava",
  lastName: "Khan",
  last_name: "Khan",
  fullName: "Ava Khan",
  worker_name: "Ava Khan",
  phone: "+447700900123",
  worker_phone: "+447700900123",
  position: "Door Supervisor",
  worker_role: "Door Supervisor",
  department: "Security",
  location: "Heathrow Terminal 5",
  location_name: "Heathrow Terminal 5",
  shiftDate: "20 Jul 2026",
  shift_date: "20 Jul 2026",
  startTime: "0645",
  shift_start_time: "0645",
  endTime: "1900",
  shift_end_time: "1900",
  shiftTime: "0645 - 1900",
  shift_time: "0645 - 1900",
  checkInUrl: "http://localhost:3000/check-in/sample-token",
  check_in_url: "http://localhost:3000/check-in/sample-token",
  minutesUntilStart: "60",
  minutes_until_start: "60",
};

const variableGroups = [
  ["worker_name", "location_name", "shift_date", "shift_start_time", "shift_end_time"],
  ["firstName", "fullName", "location", "startTime", "endTime", "checkInUrl"],
];

function preview(content: string) {
  return content.replace(/\{\{(\w+)}}/g, (_, key: string) => sampleData[key] ?? "");
}

function emptyTemplate(): Template {
  return {
    id: "new",
    name: "",
    description: "",
    content: "Hello {{worker_name}}, this is a reminder that your shift at {{location_name}} starts at {{shift_start_time}}.",
    active: true,
    systemTemplate: false,
    _count: { triggerRules: 0 },
  };
}

export function TemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "new");
  const [draft, setDraft] = useState<Template>(templates[0] ?? emptyTemplate());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = useMemo(() => templates.find((template) => template.id === selectedId), [selectedId, templates]);

  function selectTemplate(template: Template | "new") {
    if (template === "new") {
      setSelectedId("new");
      setDraft(emptyTemplate());
    } else {
      setSelectedId(template.id);
      setDraft(template);
    }
    setMessage(null);
  }

  async function submit(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setMessage(null);
    const response = await fetch("/api/templates", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; template?: Template };
    if (!response.ok) {
      setMessage(data.error ?? "Template action failed.");
      return;
    }
    setMessage("Template saved.");
    if (data.template) {
      setSelectedId(data.template.id);
      setDraft(data.template);
    }
    startTransition(() => router.refresh());
  }

  async function deleteTemplate() {
    if (draft.id === "new") return;
    const ok = window.confirm("Delete this template? This cannot be undone.");
    if (!ok) return;
    const response = await fetch(`/api/templates?id=${draft.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Template could not be deleted.");
      return;
    }
    selectTemplate("new");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Message Template</CardTitle>
            <Button type="button" className="bg-[#171717] text-white hover:bg-[#222]" onClick={() => selectTemplate("new")}>
              New Template
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Template name</span>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Shift Reminder" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Short description</span>
              <Input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Used before shift starts" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Message text</span>
              <Textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
              <span className="block text-xs text-zinc-500">Use variables with double braces, for example {"{{worker_name}}"}.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={isPending} onClick={() => submit(draft.id === "new" ? "POST" : "PATCH", draft)}>
                <Save className="size-4" aria-hidden="true" /> Save
              </Button>
              {draft.id !== "new" ? (
                <>
                  <Button type="button" className="bg-[#171717] text-white hover:bg-[#222]" onClick={() => submit("PATCH", { id: draft.id, active: !draft.active })}>
                    {draft.active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />} {draft.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button type="button" className="bg-[#171717] text-white hover:bg-[#222]" onClick={() => submit("POST", { action: "duplicate", id: draft.id })}>
                    <Copy className="size-4" aria-hidden="true" /> Duplicate
                  </Button>
                  <Button type="button" className="border-red-900 bg-red-950 text-red-100 hover:bg-red-900" onClick={deleteTemplate}>
                    <Trash2 className="size-4" aria-hidden="true" /> Delete
                  </Button>
                </>
              ) : null}
            </div>
            {message ? <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Preview Before Saving</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-[#333] bg-[#080808] p-4 text-sm leading-6 text-zinc-100">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase text-zinc-500"><Eye className="size-4" aria-hidden="true" /> Worker will see</div>
              {preview(draft.content)}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-200">Useful variables</p>
              {variableGroups.map((group) => (
                <div key={group.join("-")} className="flex flex-wrap gap-2">
                  {group.map((variable) => <Badge key={variable}>{`{{${variable}}}`}</Badge>)}
                </div>
              ))}
            </div>
            {selected?._count?.triggerRules ? (
              <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">
                This template is used by {selected._count.triggerRules} rule{selected._count.triggerRules === 1 ? "" : "s"}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Existing Templates</CardTitle></CardHeader>
        <CardContent>
          {templates.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`min-h-28 rounded-md border p-4 text-left transition ${template.id === selectedId ? "border-[#c8a45d] bg-[#17140d]" : "border-[#2c2c2c] bg-[#0b0b0b] hover:border-[#555]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-white">{template.name}</p>
                    <Badge>{template.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{template.content}</p>
                </button>
              ))}
            </div>
          ) : <EmptyState title="No templates" body="Create your first message template above." />}
        </CardContent>
      </Card>
    </div>
  );
}
