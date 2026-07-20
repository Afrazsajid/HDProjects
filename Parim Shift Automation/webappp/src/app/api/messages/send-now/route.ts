import { addHours, addMinutes, subHours } from "date-fns";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { sendText } from "@/src/lib/openwa/client";
import { renderTemplate } from "@/src/lib/scheduler/renderer";
import { getShiftDisplayStatus } from "@/src/lib/shifts/status";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type SendableShift = Awaited<ReturnType<typeof findMatchingShifts>>[number];
type SendableWorker = Awaited<ReturnType<typeof findMatchingWorkers>>[number];

async function findMatchingShifts(body: Record<string, unknown>) {
  const now = new Date();
  const mode = asString(body.mode);
  const workerIds = asStringArray(body.workerIds);
  const status = asString(body.shiftStatus);
  const timingWhere =
    status === "ACTIVE"
      ? { startAtUtc: { lte: now }, endAtUtc: { gte: now }, status: { not: "CANCELLED" } }
      : status === "UPCOMING"
        ? { startAtUtc: { gt: now }, status: { not: "CANCELLED" } }
        : status === "ENDED" || status === "COMPLETED"
          ? { endAtUtc: { lt: now }, status: { not: "CANCELLED" } }
          : {};
  const baseWhere = {
    ...(workerIds.length ? { workerId: { in: workerIds } } : {}),
    ...(asString(body.locationId) ? { locationId: asString(body.locationId) } : {}),
    ...(status && !["ACTIVE", "UPCOMING", "ENDED", "COMPLETED"].includes(status) ? { status } : {}),
  };

  if (mode === "shift" && asString(body.shiftId)) {
    return prisma.shift.findMany({ where: { id: asString(body.shiftId) }, include: { worker: true, location: true } });
  }
  if (mode === "location") {
    return prisma.shift.findMany({ where: { ...baseWhere, endAtUtc: { gt: now } }, include: { worker: true, location: true }, take: 200 });
  }
  if (mode === "startingSoon") {
    return prisma.shift.findMany({
      where: { ...baseWhere, startAtUtc: { gte: now, lte: addMinutes(now, asNumber(body.minutes, 120)) } },
      include: { worker: true, location: true },
      take: 200,
    });
  }
  if (mode === "currentlyOnShift") {
    return prisma.shift.findMany({
      where: { ...baseWhere, startAtUtc: { lte: now }, endAtUtc: { gte: now }, status: { not: "CANCELLED" } },
      include: { worker: true, location: true },
      take: 200,
    });
  }
  if (mode === "ended") {
    return prisma.shift.findMany({
      where: { ...baseWhere, endAtUtc: { gte: subHours(now, asNumber(body.hours, 24)), lte: now } },
      include: { worker: true, location: true },
      take: 200,
    });
  }
  if (mode === "status" && status) {
    const shifts = await prisma.shift.findMany({ where: { ...baseWhere, ...timingWhere }, include: { worker: true, location: true }, take: 200 });
    return shifts.filter((shift) => status === "COMPLETED" ? getShiftDisplayStatus(shift) === "ENDED" : getShiftDisplayStatus(shift) === status);
  }
  return [];
}

async function findMatchingWorkers(body: Record<string, unknown>) {
  const workerIds = asStringArray(body.workerIds);
  if (!workerIds.length) return [];
  return prisma.worker.findMany({ where: { id: { in: workerIds } }, orderBy: { fullName: "asc" } });
}

function fallbackShift(worker: SendableWorker) {
  const now = new Date();
  return {
    id: "send-now",
    startAtUtc: now,
    endAtUtc: addHours(now, 1),
    startTimeLocal: "now",
    endTimeLocal: "later",
    position: worker.position ?? "",
    department: worker.department,
    worker: {
      firstName: worker.firstName,
      lastName: worker.lastName,
      fullName: worker.fullName,
      phoneE164: worker.phoneE164,
    },
    location: { name: "No shift selected" },
  };
}

function uniqueByRecipient(shifts: SendableShift[]) {
  const seen = new Set<string>();
  return shifts.filter((shift) => {
    const key = `${shift.workerId}:${shift.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const template = await prisma.messageTemplate.findUnique({ where: { id: asString(body.templateId) } });
  if (!template) return Response.json({ error: "Choose a message template." }, { status: 400 });

  const mode = asString(body.mode) || "workers";
  const shifts = uniqueByRecipient(await findMatchingShifts({ ...body, mode }));
  const directWorkers = mode === "workers" && shifts.length === 0 ? await findMatchingWorkers(body) : [];
  const dryRun = body.dryRun === true;
  const results = [];

  for (const shift of shifts) {
    const worker = shift.worker;
    if (!worker.active || !worker.whatsappOptIn || worker.doNotContact || !worker.whatsappChatId) {
      results.push({ workerId: worker.id, workerName: worker.fullName, status: "SKIPPED", error: "Worker is not contactable." });
      continue;
    }
    const text = renderTemplate({ template: template.content, shift });
    if (dryRun) {
      results.push({ workerId: worker.id, workerName: worker.fullName, phone: worker.phoneE164, shiftId: shift.id, status: "PREVIEW", text });
      continue;
    }
    const result = await sendText({ sessionId: env.OPENWA_SESSION_ID, chatId: worker.whatsappChatId, text });
    await prisma.messageEvent.create({
      data: {
        shiftId: shift.id,
        direction: "OUTBOUND",
        eventType: "message.sent_now",
        whatsappChatId: worker.whatsappChatId,
        openwaMessageId: result.messageId,
        text,
        payloadJson: JSON.stringify({ templateId: template.id, mode, result }),
        occurredAt: new Date(),
      },
    });
    results.push({ workerId: worker.id, workerName: worker.fullName, phone: worker.phoneE164, shiftId: shift.id, status: "SENT", text });
  }

  for (const worker of directWorkers) {
    if (!worker.active || !worker.whatsappOptIn || worker.doNotContact || !worker.whatsappChatId) {
      results.push({ workerId: worker.id, workerName: worker.fullName, status: "SKIPPED", error: "Worker is not contactable." });
      continue;
    }
    const text = renderTemplate({ template: template.content, shift: fallbackShift(worker) });
    if (dryRun) {
      results.push({ workerId: worker.id, workerName: worker.fullName, phone: worker.phoneE164, status: "PREVIEW", text });
      continue;
    }
    const result = await sendText({ sessionId: env.OPENWA_SESSION_ID, chatId: worker.whatsappChatId, text });
    await prisma.messageEvent.create({
      data: {
        direction: "OUTBOUND",
        eventType: "message.sent_now",
        whatsappChatId: worker.whatsappChatId,
        openwaMessageId: result.messageId,
        text,
        payloadJson: JSON.stringify({ templateId: template.id, mode, result }),
        occurredAt: new Date(),
      },
    });
    results.push({ workerId: worker.id, workerName: worker.fullName, phone: worker.phoneE164, status: "SENT", text });
  }

  return Response.json({
    ok: true,
    dryRun,
    recipientCount: results.filter((result) => result.status !== "SKIPPED").length,
    results,
  });
}
