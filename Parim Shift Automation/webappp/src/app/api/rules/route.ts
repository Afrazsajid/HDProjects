import { prisma } from "@/src/lib/prisma";
import { rebuildFutureForAllUpcoming } from "@/src/lib/scheduler/generator";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function buildConditions(body: Record<string, unknown>) {
  const conditions: Record<string, unknown> = {
    workerActive: true,
    whatsappOptIn: true,
    requirePhone: true,
  };
  const includeLocations = asStringArray(body.includeLocations);
  const includePositions = asStringArray(body.includePositions);
  const includeDepartments = asStringArray(body.includeDepartments);
  const shiftStatuses = asStringArray(body.shiftStatuses);
  if (includeLocations.length) conditions.includeLocations = includeLocations;
  if (includePositions.length) conditions.includePositions = includePositions;
  if (includeDepartments.length) conditions.includeDepartments = includeDepartments;
  if (shiftStatuses.length) conditions.shiftStatuses = shiftStatuses;
  if (asString(body.startTimeFrom) && asString(body.startTimeTo)) conditions.startTimeRange = { from: asString(body.startTimeFrom), to: asString(body.startTimeTo) };
  if (asString(body.endTimeFrom) && asString(body.endTimeTo)) conditions.endTimeRange = { from: asString(body.endTimeFrom), to: asString(body.endTimeTo) };
  if (asString(body.dateFrom) || asString(body.dateTo)) conditions.dateRange = { from: asString(body.dateFrom) || undefined, to: asString(body.dateTo) || undefined };
  if (asString(body.customDateTimeUtc)) conditions.customDateTimeUtc = asString(body.customDateTimeUtc);
  return JSON.stringify(conditions);
}

async function rebuildAfterRuleChange(ruleId?: string, enabled = true) {
  await prisma.scheduledMessage.deleteMany({
    where: {
      ...(ruleId ? { triggerRuleId: ruleId } : {}),
      status: "PENDING",
      dueAtUtc: { gt: new Date() },
    },
  });
  if (enabled) await rebuildFutureForAllUpcoming();
}

export async function GET() {
  return Response.json({ rules: await prisma.triggerRule.findMany({ include: { template: true }, orderBy: { priority: "asc" } }) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  if (body.action === "duplicate") {
    const id = asString(body.id);
    const source = await prisma.triggerRule.findUnique({ where: { id } });
    if (!source) return Response.json({ error: "Rule not found" }, { status: 404 });
    const rule = await prisma.triggerRule.create({
      data: {
        name: `${source.name} copy`,
        description: source.description,
        enabled: false,
        anchor: source.anchor,
        offsetMinutes: source.offsetMinutes,
        recurrenceIntervalMinutes: source.recurrenceIntervalMinutes,
        maximumOccurrences: source.maximumOccurrences,
        recurrenceStop: source.recurrenceStop,
        priority: source.priority + 1,
        templateId: source.templateId,
        conditionsJson: source.conditionsJson,
      },
    });
    return Response.json({ rule });
  }

  const name = asString(body.name);
  const templateId = asString(body.templateId);
  if (name.length < 2) return Response.json({ error: "Enter a rule name." }, { status: 400 });
  if (!templateId) return Response.json({ error: "Choose a message template." }, { status: 400 });

  const rule = await prisma.triggerRule.create({
    data: {
      name,
      description: asString(body.description) || null,
      enabled: Boolean(body.enabled),
      anchor: asString(body.anchor) || "SHIFT_START",
      offsetMinutes: asNumber(body.offsetMinutes, 0),
      recurrenceIntervalMinutes: asOptionalNumber(body.recurrenceIntervalMinutes),
      maximumOccurrences: asOptionalNumber(body.maximumOccurrences),
      recurrenceStop: asString(body.recurrenceStop) || "MANUAL",
      priority: asNumber(body.priority, 100),
      templateId,
      conditionsJson: buildConditions(body),
    },
  });
  await rebuildAfterRuleChange(rule.id, rule.enabled);
  return Response.json({ rule });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const id = asString(body.id);
  const existing = await prisma.triggerRule.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Rule not found" }, { status: 404 });

  const rule = await prisma.triggerRule.update({
    where: { id },
    data: {
      name: body.name === undefined ? undefined : asString(body.name),
      description: body.description === undefined ? undefined : asString(body.description) || null,
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
      anchor: body.anchor === undefined ? undefined : asString(body.anchor),
      offsetMinutes: body.offsetMinutes === undefined ? undefined : asNumber(body.offsetMinutes, existing.offsetMinutes),
      recurrenceIntervalMinutes: body.recurrenceIntervalMinutes === undefined ? undefined : asOptionalNumber(body.recurrenceIntervalMinutes),
      maximumOccurrences: body.maximumOccurrences === undefined ? undefined : asOptionalNumber(body.maximumOccurrences),
      recurrenceStop: body.recurrenceStop === undefined ? undefined : asString(body.recurrenceStop),
      priority: body.priority === undefined ? undefined : asNumber(body.priority, existing.priority),
      templateId: body.templateId === undefined ? undefined : asString(body.templateId),
      conditionsJson: body.conditionsJson === undefined ? buildConditions(body) : asString(body.conditionsJson),
    },
  });
  await rebuildAfterRuleChange(rule.id, rule.enabled);
  return Response.json({ rule });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await prisma.scheduledMessage.deleteMany({ where: { triggerRuleId: id, status: "PENDING" } });
  await prisma.triggerRule.delete({ where: { id } });
  return Response.json({ ok: true });
}
