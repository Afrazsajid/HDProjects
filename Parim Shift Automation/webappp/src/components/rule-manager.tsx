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
  includeLocations: string[];
  excludeLocations: string[];
  shiftStatus: string;
  startTimeFrom: string;
  startTimeTo: string;
  reminderType: string;
  reminderPattern: string;
  maxRemindersPerWorker: string;
  minIntervalMinutes: string;
  maxIntervalMinutes: string;
  firstReminderDelayMinutes: string;
  stopAtShiftEnd: boolean;
  stopAfterFormCompletion: boolean;
  staggerSameSite: boolean;
  minWorkerGapSeconds: string;
  staggeringWindowMinutes: string;
  customIntervalSequence: string;
};

type RulePreview = {
  locationSummary: string;
  matchingLocations: Array<{ name: string; workers: number }>;
  excludedLocations: string[];
  matchingWorkers: number;
  maxRemindersPerWorker: number;
  potentialMessages: number;
  removedAfterShiftEnd: number;
  finalScheduledMessages: number;
  siteStaggeringEnabled: boolean;
  exampleWorkers: Array<{ shiftId: string; workerName: string; locationName: string; reminderTimes: string[]; staggerOffsetSeconds: number }>;
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

function arrayFrom(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
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
    includeLocations: arrayFrom(conditions.includeLocations),
    excludeLocations: arrayFrom(conditions.excludeLocations),
    shiftStatus: Array.isArray(conditions.shiftStatuses) ? String(conditions.shiftStatuses[0] ?? "") : "",
    startTimeFrom: startTimeRange?.from ?? "",
    startTimeTo: startTimeRange?.to ?? "",
    reminderType: String(conditions.reminderType ?? "STANDARD"),
    reminderPattern: String(conditions.reminderPattern ?? "FIXED"),
    maxRemindersPerWorker: String(conditions.maxRemindersPerWorker ?? rule?.maximumOccurrences ?? 12),
    minIntervalMinutes: String(conditions.minIntervalMinutes ?? rule?.recurrenceIntervalMinutes ?? 15),
    maxIntervalMinutes: String(conditions.maxIntervalMinutes ?? 20),
    firstReminderDelayMinutes: String(conditions.firstReminderDelayMinutes ?? 15),
    stopAtShiftEnd: conditions.stopAtShiftEnd !== false,
    stopAfterFormCompletion: conditions.stopAfterFormCompletion === true || rule?.recurrenceStop === "CHECKED_IN",
    staggerSameSite: conditions.staggerSameSite === true,
    minWorkerGapSeconds: String(conditions.minWorkerGapSeconds ?? 60),
    staggeringWindowMinutes: String(conditions.staggeringWindowMinutes ?? 10),
    customIntervalSequence: Array.isArray(conditions.customIntervalSequence) ? conditions.customIntervalSequence.join(", ") : "",
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

function locationNames(values: string[], locations: LocationOption[]) {
  return values.map((value) => locations.find((location) => location.normalisedName === value)?.name ?? value);
}

function summary(draft: Draft, templates: Template[], locations: LocationOption[]) {
  const template = templates.find((item) => item.id === draft.templateId)?.name ?? "selected template";
  const timing = timingOptions.find((option) => option.value === draft.timing)?.label.toLowerCase() ?? "at the chosen time";
  const included = locationNames(draft.includeLocations, locations);
  const excluded = locationNames(draft.excludeLocations, locations);
  const locationSummary = included.length ? `only ${included.join(", ")}` : excluded.length ? `all locations except ${excluded.join(", ")}` : "all locations";
  if (draft.reminderType === "FORM_REMINDER") {
    const pattern = draft.reminderPattern === "EVENLY_SPREAD"
      ? "equal gaps calculated from each worker's shift length"
      : draft.reminderPattern === "INTELLIGENT"
        ? `${draft.minIntervalMinutes}-${draft.maxIntervalMinutes} minute intelligent intervals`
        : draft.reminderPattern === "CUSTOM"
          ? "a custom interval sequence"
          : `${draft.minIntervalMinutes} minute fixed intervals`;
    return `Send up to ${draft.maxRemindersPerWorker || 12} form reminders per worker using ${pattern}. Apply this rule to ${locationSummary}. ${draft.staggerSameSite ? "Stagger reminders between workers at the same site. " : ""}Stop ${draft.stopAfterFormCompletion ? "after form completion or " : ""}when the shift ends.`;
  }
  const repeat = draft.recurrenceIntervalMinutes ? ` It will repeat every ${draft.recurrenceIntervalMinutes} minutes${draft.maximumOccurrences ? ` up to ${draft.maximumOccurrences} times` : ""}.` : " It will send only once.";
  const stop = draft.recurrenceIntervalMinutes ? ` Repeating stops at: ${draft.recurrenceStop.replaceAll("_", " ").toLowerCase()}.` : "";
  return `This rule will send the "${template}" template ${timing} for ${locationSummary}.${repeat}${stop}`;
}

function payloadFromDraft(draft: Draft, enabled: boolean) {
  const timing = timingPayload(draft);
  return {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    templateId: draft.templateId,
    enabled,
    ...timing,
    customDateTimeUtc: draft.customDateTime ? new Date(draft.customDateTime).toISOString() : "",
    recurrenceIntervalMinutes: draft.reminderType === "FORM_REMINDER" ? "" : draft.recurrenceIntervalMinutes,
    maximumOccurrences: draft.reminderType === "FORM_REMINDER" ? draft.maxRemindersPerWorker : draft.maximumOccurrences,
    recurrenceStop: draft.stopAfterFormCompletion ? "CHECKED_IN" : draft.recurrenceStop,
    includeLocations: draft.includeLocations,
    excludeLocations: draft.excludeLocations,
    shiftStatuses: draft.shiftStatus ? [draft.shiftStatus] : [],
    startTimeFrom: draft.startTimeFrom,
    startTimeTo: draft.startTimeTo,
    reminderType: draft.reminderType,
    reminderPattern: draft.reminderPattern,
    maxRemindersPerWorker: draft.maxRemindersPerWorker,
    minIntervalMinutes: draft.minIntervalMinutes,
    maxIntervalMinutes: draft.maxIntervalMinutes,
    firstReminderDelayMinutes: draft.firstReminderDelayMinutes,
    stopAtShiftEnd: draft.stopAtShiftEnd,
    stopAfterFormCompletion: draft.stopAfterFormCompletion,
    staggerSameSite: draft.staggerSameSite,
    minWorkerGapSeconds: draft.minWorkerGapSeconds,
    staggeringWindowMinutes: draft.staggeringWindowMinutes,
    customIntervalSequence: draft.customIntervalSequence.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0),
    priority: 100,
  };
}

function MultiLocationSelect({
  title,
  selected,
  locations,
  onToggle,
}: {
  title: string;
  selected: string[];
  locations: LocationOption[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = locations.filter((location) => location.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-zinc-200">{title}</span>
      <Input placeholder="Search locations" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="max-h-44 overflow-y-auto rounded-md border border-[#333] bg-[#080808] p-2">
        {filtered.map((location) => (
          <label key={location.id} className="flex min-h-11 items-center gap-3 border-b border-[#181818] py-2 text-sm text-zinc-200 last:border-b-0">
            <input type="checkbox" checked={selected.includes(location.normalisedName)} onChange={() => onToggle(location.normalisedName)} />
            <span>{location.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function RuleManager({ rules, templates, locations }: { rules: Rule[]; templates: Template[]; locations: LocationOption[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "new");
  const [draft, setDraft] = useState<Draft>(draftFromRule(rules[0], templates));
  const [quickTemplate, setQuickTemplate] = useState({ name: "", content: "Hello {{worker_name}}, your shift at {{location_name}} starts at {{shift_start_time}}." });
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentSummary = useMemo(() => summary(draft, templates, locations), [draft, templates, locations]);

  function selectRule(rule: Rule | "new") {
    setSelectedId(rule === "new" ? "new" : rule.id);
    setDraft(draftFromRule(rule === "new" ? undefined : rule, templates));
    setMessage(null);
    setPreview(null);
  }

  function toggleLocation(field: "includeLocations" | "excludeLocations", value: string) {
    setDraft((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
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

  async function previewRule() {
    setMessage(null);
    const response = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", ...payloadFromDraft(draft, draft.enabled) }),
    });
    const data = (await response.json().catch(() => ({}))) as RulePreview & { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Rule preview failed.");
      return;
    }
    setPreview(data);
  }

  async function saveRule(enabledOverride?: boolean) {
    if ((enabledOverride ?? draft.enabled) && !window.confirm(`${currentSummary}\n\nActivate this rule?`)) return;
    const response = await fetch("/api/rules", {
      method: draft.id === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromDraft(draft, enabledOverride ?? draft.enabled)),
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
    await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromDraft(draftFromRule(rule, templates), !rule.enabled)),
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
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Form reminder pattern" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Message template</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.templateId} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.active ? "" : " (inactive)"}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Rule type</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.reminderType} onChange={(event) => setDraft({ ...draft, reminderType: event.target.value })}>
                <option value="STANDARD">Normal message rule</option>
                <option value="FORM_REMINDER">Intelligent form reminder</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">When should the rule begin?</span>
              <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.timing} onChange={(event) => setDraft({ ...draft, timing: event.target.value })}>
                {timingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="block text-xs text-zinc-500">{timingOptions.find((option) => option.value === draft.timing)?.help}</span>
            </label>
          </div>

          {["beforeStart", "afterStart", "beforeEnd", "afterEnd"].includes(draft.timing) ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">How many minutes from that point?</span>
              <Input type="number" min="1" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} />
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <MultiLocationSelect title="Include selected locations" selected={draft.includeLocations} locations={locations} onToggle={(value) => toggleLocation("includeLocations", value)} />
            <MultiLocationSelect title="Exclude selected locations" selected={draft.excludeLocations} locations={locations} onToggle={(value) => toggleLocation("excludeLocations", value)} />
          </div>

          {draft.reminderType === "FORM_REMINDER" ? (
            <div className="space-y-4 rounded-md border border-[#2c2c2c] bg-[#0b0b0b] p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-200">Reminder pattern</span>
                  <select className="min-h-11 w-full rounded-md border border-[#333] bg-[#080808] px-3 text-sm text-white" value={draft.reminderPattern} onChange={(event) => setDraft({ ...draft, reminderPattern: event.target.value })}>
                    <option value="FIXED">Fixed interval</option>
                    <option value="EVENLY_SPREAD">Spread evenly across the shift</option>
                    <option value="INTELLIGENT">Intelligent staggered interval</option>
                    <option value="CUSTOM">Custom interval sequence</option>
                  </select>
                  <span className="block text-xs text-zinc-500">
                    {draft.reminderPattern === "EVENLY_SPREAD" ? "Automatically divides each worker's shift length by the maximum reminder count." : "Choose how the reminder times are calculated."}
                  </span>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-200">Maximum reminders per worker</span>
                  <Input type="number" min="1" max="12" value={draft.maxRemindersPerWorker} onChange={(event) => setDraft({ ...draft, maxRemindersPerWorker: event.target.value })} />
                </label>
                {draft.reminderPattern === "EVENLY_SPREAD" ? (
                  <div className="rounded-md border border-[#242424] bg-[#080808] p-3 text-sm leading-6 text-zinc-300">
                    First send happens after the first equal gap.
                  </div>
                ) : (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">First reminder delay</span>
                    <Input type="number" min="0" value={draft.firstReminderDelayMinutes} onChange={(event) => setDraft({ ...draft, firstReminderDelayMinutes: event.target.value })} />
                  </label>
                )}
              </div>
              {draft.reminderPattern === "EVENLY_SPREAD" ? (
                <div className="rounded-md border border-[#242424] bg-[#080808] p-3 text-sm leading-6 text-zinc-300">
                  For each shift, the system calculates: shift length divided by maximum reminders. A 12-hour shift with 12 reminders sends about every 60 minutes; a 6-hour shift sends about every 30 minutes.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">Minimum interval</span>
                    <Input type="number" min="1" value={draft.minIntervalMinutes} onChange={(event) => setDraft({ ...draft, minIntervalMinutes: event.target.value })} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">Maximum interval</span>
                    <Input type="number" min="1" value={draft.maxIntervalMinutes} onChange={(event) => setDraft({ ...draft, maxIntervalMinutes: event.target.value })} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">Custom sequence</span>
                    <Input value={draft.customIntervalSequence} onChange={(event) => setDraft({ ...draft, customIntervalSequence: event.target.value })} placeholder="15, 19, 16, 18" />
                  </label>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200">
                  <input type="checkbox" checked={draft.stopAtShiftEnd} onChange={(event) => setDraft({ ...draft, stopAtShiftEnd: event.target.checked })} />
                  Stop at shift end
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200">
                  <input type="checkbox" checked={draft.stopAfterFormCompletion} onChange={(event) => setDraft({ ...draft, stopAfterFormCompletion: event.target.checked })} />
                  Stop after form completion
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200">
                  <input type="checkbox" checked={draft.staggerSameSite} onChange={(event) => setDraft({ ...draft, staggerSameSite: event.target.checked })} />
                  Stagger workers at same site
                </label>
              </div>
              {draft.staggerSameSite ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">Minimum delay between workers, seconds</span>
                    <Input type="number" min="0" value={draft.minWorkerGapSeconds} onChange={(event) => setDraft({ ...draft, minWorkerGapSeconds: event.target.value })} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-200">Maximum staggering window, minutes</span>
                    <Input type="number" min="0" value={draft.staggeringWindowMinutes} onChange={(event) => setDraft({ ...draft, staggeringWindowMinutes: event.target.value })} />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
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
          )}

          <div className="grid gap-4 md:grid-cols-2">
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
            <Button type="button" disabled={isPending} onClick={previewRule}>Preview schedule</Button>
            <Button type="button" disabled={isPending} onClick={() => saveRule(false)}><Save className="size-4" aria-hidden="true" /> Save inactive</Button>
            <Button type="button" disabled={isPending} className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => saveRule(true)}><Play className="size-4" aria-hidden="true" /> Save and activate</Button>
          </div>
          {message ? <p className="rounded-md border border-[#333] bg-[#080808] p-3 text-sm text-zinc-300">{message}</p> : null}
          {preview ? (
            <div className="rounded-md border border-[#333] bg-[#080808] p-4 text-sm text-zinc-300">
              <p className="font-medium text-white">Preview: {preview.locationSummary}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <Badge>Workers: {preview.matchingWorkers}</Badge>
                <Badge>Max each: {preview.maxRemindersPerWorker}</Badge>
                <Badge>Potential: {preview.potentialMessages}</Badge>
                <Badge>Final: {preview.finalScheduledMessages}</Badge>
              </div>
              <p className="mt-3">Removed after shift end: {preview.removedAfterShiftEnd}. Site staggering: {preview.siteStaggeringEnabled ? "Yes" : "No"}.</p>
              <div className="mt-3 space-y-2">
                {preview.exampleWorkers.map((worker) => (
                  <div key={worker.shiftId} className="rounded-md border border-[#242424] p-3">
                    <p className="font-medium text-zinc-100">{worker.workerName} at {worker.locationName}</p>
                    <p className="mt-1 text-xs text-zinc-500">Stagger offset: {worker.staggerOffsetSeconds}s</p>
                    <p className="mt-2 font-mono text-xs text-zinc-300">{worker.reminderTimes.join(" | ")}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
