"use client";

import { Copy, Pause, Play, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea } from "@/src/components/ui/primitives";

type Template = { id: string; name: string; content: string; active: boolean };
type LocationOption = { id: string; name: string; normalisedName: string };
type Rule = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  anchor: string;
  offsetMinutes: number;
  recurrenceIntervalMinutes: number | null;
  maximumOccurrences: number | null;
  recurrenceStop: string;
  priority: number;
  templateId: string;
  conditionsJson: string;
  template: Template;
};

type Draft = {
  id: string;
  name: string;
  description: string;
  templateId: string;
  enabled: boolean;
  timing: string;
  minutes: string;
  customDateTime: string;
  recurrenceIntervalMinutes: string;
  maximumOccurrences: string;
  recurrenceStop: string;
  includeLocation: string;
  shiftStatus: string;
  startTimeFrom: string;
  startTimeTo: string;
};

const timingOptions = [
  { value: "beforeStart", label: "Before the shift starts", help: "Best for reminders before arrival." },
  { value: "atStart", label: "At the exact shift start time", help: "Sends when the shift begins." },
  { value: "afterStart", label: "After the shift starts", help: "Useful for late check-in reminders." },
  { value: "beforeEnd", label: "Before the shift ends", help: "Useful for checkout preparation." },
  { value: "atEnd", label: "At the exact shift end time", help: "Sends when the shift finishes." },
  { value: "afterEnd", label: "After the shift ends", help: "Useful for checkout follow-up." },
  { value: "customDateTime", label: "At a custom date and time", help: "Sends at one fixed London date/time to matching shifts." },
  { value: "shiftUpdated", label: "When a shift is created or worker assigned", help: "Sends as soon as the schedule is generated." },
];

function parseConditions(rule?: Rule) {
  try {
    return rule ? JSON.parse(rule.conditionsJson || "{}") as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function timingFromRule(rule?: Rule) {
  if (!rule) return "beforeStart";
  if (rule.anchor === "CUSTOM_DATE_TIME") return "customDateTime";
  if (rule.anchor === "SHIFT_CREATED_OR_UPDATED" || rule.anchor === "WORKER_ASSIGNED") return "shiftUpdated";
  if (rule.anchor === "SHIFT_END") {
    if (rule.offsetMinutes < 0) return "beforeEnd";
    if (rule.offsetMinutes > 0) return "afterEnd";
    return "atEnd";
  }
  if (rule.offsetMinutes < 0) return "beforeStart";
  if (rule.offsetMinutes > 0) return "afterStart";
  return "atStart";
}

function toDateTimeLocal(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

function draftFromRule(rule: Rule | undefined, templates: Template[]): Draft {
  const conditions = parseConditions(rule);
  const startTimeRange = conditions.startTimeRange as { from?: string; to?: string } | undefined;
  return {
    id: rule?.id ?? "new",
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    templateId: rule?.templateId ?? templates[0]?.id ?? "",
    enabled: rule?.enabled ?? false,
    timing: timingFromRule(rule),
    minutes: rule?.offsetMinutes ? String(Math.abs(rule.offsetMinutes)) : "60",
    customDateTime: toDateTimeLocal(conditions.customDateTimeUtc),
    recurrenceIntervalMinutes: rule?.recurrenceIntervalMinutes ? String(rule.recurrenceIntervalMinutes) : "",
    maximumOccurrences: rule?.maximumOccurrences ? String(rule.maximumOccurrences) : "",
    recurrenceStop: rule?.recurrenceStop ?? "SHIFT_START",
    includeLocation: Array.isArray(conditions.includeLocations) ? String(conditions.includeLocations[0] ?? "") : "",
    shiftStatus: Array.isArray(conditions.shiftStatuses) ? String(conditions.shiftStatuses[0] ?? "") : "",
    startTimeFrom: startTimeRange?.from ?? "",
    startTimeTo: startTimeRange?.to ?? "",
  };
}

function timingPayload(draft: Draft) {
  const minutes = Number(draft.minutes || 0);
  if (draft.timing === "beforeEnd") return { anchor: "SHIFT_END", offsetMinutes: -Math.abs(minutes) };
  if (draft.timing === "atEnd") return { anchor: "SHIFT_END", offsetMinutes: 0 };
  if (draft.timing === "afterEnd") return { anchor: "SHIFT_END", offsetMinutes: Math.abs(minutes) };
  if (draft.timing === "afterStart") return { anchor: "SHIFT_START", offsetMinutes: Math.abs(minutes) };
  if (draft.timing === "atStart") return { anchor: "SHIFT_START", offsetMinutes: 0 };
  if (draft.timing === "customDateTime") return { anchor: "CUSTOM_DATE_TIME", offsetMinutes: 0 };
  if (draft.timing === "shiftUpdated") return { anchor: "SHIFT_CREATED_OR_UPDATED", offsetMinutes: 0 };
  return { anchor: "SHIFT_START", offsetMinutes: -Math.abs(minutes) };
}

function summary(draft: Draft, templates: Template[], locations: LocationOption[]) {
  const template = templates.find((item) => item.id === draft.templateId)?.name ?? "selected template";
  const timing = timingOptions.find((option) => option.value === draft.timing)?.label.toLowerCase() ?? "at the chosen time";
  const location = locations.find((item) => item.normalisedName === draft.includeLocation)?.name;
  const repeat = draft.recurrenceIntervalMinutes
    ? ` It will repeat every ${draft.recurrenceIntervalMinutes} minutes${draft.maximumOccurrences ? ` up to ${draft.maximumOccurrences} times` : ""}.`
    : " It will send only once.";
  const stop = draft.recurrenceIntervalMinutes ? ` Repeating stops at: ${draft.recurrenceStop.replaceAll("_", " ").toLowerCase()}.` : "";
  return `This rule will send the "${template}" template ${timing}${location ? ` for shifts at ${location}` : " for matching shifts"}.${repeat}${stop}`;
}

export function RuleManager({ rules, templates, locations }: { rules: Rule[]; templates: Template[]; locations: LocationOption[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "new");
  const [draft, setDraft] = useState<Draft>(draftFromRule(rules[0], templates));
  const [quickTemplate, setQuickTemplate] = useState({ name: "", content: "Hello {{worker_name}}, your shift at {{location_name}} starts at {{shift_start_time}}." });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentSummary = useMemo(() => summary(draft, templates, locations), [draft, templates, locations]);

  function selectRule(rule: Rule | "new") {
    setSelectedId(rule === "new" ? "new" : rule.id);
    setDraft(draftFromRule(rule === "new" ? undefined : rule, templates));
    setMessage(null);
  }

  async function createTemplateInline() {
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: quickTemplate.name, content: quickTemplate.content, active: true }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; template?: Template };
    if (!response.ok || !data.template) {
      setMessage(data.error ?? "Template could not be created.");
      return;
    }
    setDraft({ ...draft, templateId: data.template.id });
    setQuickTemplate({ name: "", content: "Hello {{worker_name}}, your shift at {{location_name}} starts at {{shift_start_time}}." });
    setMessage("Template created and selected. Save the rule when ready.");
    startTransition(() => router.refresh());
  }

  async function saveRule(enabledOverride?: boolean) {
    if ((enabledOverride ?? draft.enabled) && !window.confirm(`${currentSummary}\n\nActivate this rule?`)) return;
    const timing = timingPayload(draft);
    const payload = {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      templateId: draft.templateId,
      enabled: enabledOverride ?? draft.enabled,
      ...timing,
      customDateTimeUtc: draft.customDateTime ? new Date(draft.customDateTime).toISOString() : "",
      recurrenceIntervalMinutes: draft.recurrenceIntervalMinutes,
      maximumOccurrences: draft.maximumOccurrences,
      recurrenceStop: draft.recurrenceStop,
      includeLocations: draft.includeLocation ? [draft.includeLocation] : [],
      shiftStatuses: draft.shiftStatus ? [draft.shiftStatus] : [],
      startTimeFrom: draft.startTimeFrom,
      startTimeTo: draft.startTimeTo,
      priority: 100,
    };
    const response = await fetch("/api/rules", {
      method: draft.id === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; rule?: Rule };
    if (!response.ok) {
      setMessage(data.error ?? "Rule could not be saved.");
      return;
    }
    setMessage("Rule saved and future messages were rebuilt.");
    if (data.rule) setSelectedId(data.rule.id);
    startTransition(() => router.refresh());
  }

  async function duplicateRule(id: string) {
    await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate", id }) });
    startTransition(() => router.refresh());
  }

  async function toggleExistingRule(rule: Rule) {
    const sourceDraft = draftFromRule(rule, templates);
    const timing = timingPayload(sourceDraft);
    await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: rule.id,
        name: rule.name,
        description: rule.description ?? "",
        templateId: rule.templateId,
        enabled: !rule.enabled,
        ...timing,
        customDateTimeUtc: sourceDraft.customDateTime ? new Date(sourceDraft.customDateTime).toISOString() : "",
        recurrenceIntervalMinutes: sourceDraft.recurrenceIntervalMinutes,
        maximumOccurrences: sourceDraft.maximumOccurrences,
        recurrenceStop: sourceDraft.recurrenceStop,
        includeLocations: sourceDraft.includeLocation ? [sourceDraft.includeLocation] : [],
        shiftStatuses: sourceDraft.shiftStatus ? [sourceDraft.shiftStatus] : [],
        startTimeFrom: sourceDraft.startTimeFrom,
        startTimeTo: sourceDraft.startTimeTo,
        priority: rule.priority,
      }),
    });
    startTransition(() => router.refresh());
  }

  async function deleteRule(id: string) {
    if (!window.confirm("Delete this rule and its pending messages?")) return;
    await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
    selectRule("new");
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Step-by-Step Rule Builder</CardTitle>
          <Button type="button" className="bg-[#171717] text-white hover:bg-[#222]" onClick={() => selectRule("new")}>New Rule</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Rule name</span>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="60 minute shift reminder" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Message template</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.templateId} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.active ? "" : " (inactive)"}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">When should the message send?</span>
            <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.timing} onChange={(event) => setDraft({ ...draft, timing: event.target.value })}>
              {timingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className="block text-xs text-zinc-500">{timingOptions.find((option) => option.value === draft.timing)?.help}</span>
          </label>
          {["beforeStart", "afterStart", "beforeEnd", "afterEnd"].includes(draft.timing) ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">How many minutes?</span>
              <Input type="number" min="1" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} />
            </label>
          ) : null}
          {draft.timing === "customDateTime" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Custom date and time</span>
              <Input type="datetime-local" value={draft.customDateTime} onChange={(event) => setDraft({ ...draft, customDateTime: event.target.value })} />
              <span className="block text-xs text-zinc-500">Use the computer clock setting for this date/time. London scheduling is handled when shift times are imported or created.</span>
            </label>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Repeat</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.recurrenceIntervalMinutes} onChange={(event) => setDraft({ ...draft, recurrenceIntervalMinutes: event.target.value })}>
                <option value="">Only once</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Stop repeating</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.recurrenceStop} onChange={(event) => setDraft({ ...draft, recurrenceStop: event.target.value })}>
                <option value="SHIFT_START">When the shift starts</option>
                <option value="SHIFT_END">When the shift ends</option>
                <option value="CHECKED_IN">When the worker checks in</option>
                <option value="MAXIMUM_OCCURRENCES">After maximum attempts</option>
                <option value="MANUAL">Only when manually stopped</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Maximum sends</span>
              <Input type="number" min="1" placeholder="Leave blank" value={draft.maximumOccurrences} onChange={(event) => setDraft({ ...draft, maximumOccurrences: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Shift location</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.includeLocation} onChange={(event) => setDraft({ ...draft, includeLocation: event.target.value })}>
                <option value="">Any location</option>
                {locations.map((location) => <option key={location.id} value={location.normalisedName}>{location.name}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Shift status</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.shiftStatus} onChange={(event) => setDraft({ ...draft, shiftStatus: event.target.value })}>
                <option value="">Any active status</option>
                {["UPCOMING", "ACTIVE", "ENDED", "SCHEDULED", "CONFIRMED", "CHECKED_IN", "COMPLETED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Shift start time range</span>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="0500" value={draft.startTimeFrom} onChange={(event) => setDraft({ ...draft, startTimeFrom: event.target.value })} />
                <Input placeholder="1200" value={draft.startTimeTo} onChange={(event) => setDraft({ ...draft, startTimeTo: event.target.value })} />
              </div>
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Description for staff</span>
            <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional note explaining this rule." />
          </label>
          <div className="rounded-md border border-[#333] bg-[#080808] p-4 text-sm leading-6 text-zinc-200">{currentSummary}</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isPending} onClick={() => saveRule(false)}><Save className="size-4" aria-hidden="true" /> Save inactive</Button>
            <Button type="button" disabled={isPending} className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => saveRule(true)}><Play className="size-4" aria-hidden="true" /> Save and activate</Button>
          </div>
          {message ? <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Create Template Here</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Template name" value={quickTemplate.name} onChange={(event) => setQuickTemplate({ ...quickTemplate, name: event.target.value })} />
            <Textarea value={quickTemplate.content} onChange={(event) => setQuickTemplate({ ...quickTemplate, content: event.target.value })} />
            <Button type="button" onClick={createTemplateInline}>Create and select template</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardContent>
            {rules.length ? (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div key={rule.id} className={`rounded-md border p-3 ${rule.id === selectedId ? "border-[#c8a45d] bg-[#17140d]" : "border-[#2c2c2c] bg-[#0b0b0b]"}`}>
                    <button type="button" className="w-full text-left" onClick={() => selectRule(rule)}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-white">{rule.name}</p>
                        <Badge>{rule.enabled ? "Active" : "Inactive"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-zinc-400">{summary(draftFromRule(rule, templates), templates, locations)}</p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333]" aria-label={`Duplicate ${rule.name}`} onClick={() => duplicateRule(rule.id)}><Copy className="size-4" /></button>
                      <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333]" aria-label={`${rule.enabled ? "Deactivate" : "Activate"} ${rule.name}`} onClick={() => toggleExistingRule(rule)}>{rule.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
                      <button className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#333] text-red-300" aria-label={`Delete ${rule.name}`} onClick={() => deleteRule(rule.id)}><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No rules" body="Create the first rule with the builder." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
