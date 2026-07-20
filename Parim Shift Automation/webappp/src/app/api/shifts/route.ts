import { createHash } from "node:crypto";
import { prisma } from "@/src/lib/prisma";
import { parseShiftBounds } from "@/src/lib/date-time";
import { rebuildFutureForShift } from "@/src/lib/scheduler/generator";
import { updateShiftStatuses } from "@/src/lib/shifts/status";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function fingerprint(values: string[]) {
  return createHash("sha256").update(values.join(":")).digest("hex");
}

export async function GET() {
  await updateShiftStatuses(prisma);
  const shifts = await prisma.shift.findMany({ include: { worker: true, location: true }, orderBy: { startAtUtc: "asc" }, take: 200 });
  return Response.json({ shifts });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const workerIds = asStringArray(body.workerIds);
  const locationId = asString(body.locationId);
  const date = asString(body.date);
  const startTime = asString(body.startTime);
  const endTime = asString(body.endTime);
  const position = asString(body.position);
  if (!workerIds.length) return Response.json({ error: "Choose at least one worker." }, { status: 400 });
  if (!locationId) return Response.json({ error: "Choose a location." }, { status: 400 });
  if (!date || !startTime || !endTime) return Response.json({ error: "Enter the shift date, start time and end time." }, { status: 400 });
  if (!position) return Response.json({ error: "Enter the role or department for this shift." }, { status: 400 });
  const bounds = parseShiftBounds(date, startTime, endTime);
  const saved = [];
  for (const workerId of workerIds) {
    const sourceFingerprint = fingerprint(["manual", workerId, locationId, date, bounds.startTimeLocal, bounds.endTimeLocal, position]);
    const shift = await prisma.shift.upsert({
      where: { sourceFingerprint },
      update: {
        locationId,
        startAtUtc: bounds.startAtUtc,
        endAtUtc: bounds.endAtUtc,
        startTimeLocal: bounds.startTimeLocal,
        endTimeLocal: bounds.endTimeLocal,
        position,
        department: asString(body.department) || null,
        status: asString(body.status) || "SCHEDULED",
      },
      create: {
        source: "manual",
        sourceFingerprint,
        workerId,
        locationId,
        shiftDateLocal: new Date(`${date}T00:00:00.000Z`),
        startAtUtc: bounds.startAtUtc,
        endAtUtc: bounds.endAtUtc,
        startTimeLocal: bounds.startTimeLocal,
        endTimeLocal: bounds.endTimeLocal,
        position,
        department: asString(body.department) || null,
        status: asString(body.status) || "SCHEDULED",
        metadataJson: JSON.stringify({ notes: asString(body.notes) || null }),
      },
    });
    await rebuildFutureForShift(shift.id);
    saved.push(shift);
  }
  return Response.json({ shifts: saved });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const id = asString(body.id);
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Shift not found" }, { status: 404 });
  const date = asString(body.date) || existing.shiftDateLocal.toISOString().slice(0, 10);
  const startTime = asString(body.startTime) || existing.startTimeLocal;
  const endTime = asString(body.endTime) || existing.endTimeLocal;
  const bounds = parseShiftBounds(date, startTime, endTime);
  const shift = await prisma.shift.update({
    where: { id },
    data: {
      locationId: body.locationId === undefined ? undefined : asString(body.locationId),
      workerId: body.workerId === undefined ? undefined : asString(body.workerId),
      shiftDateLocal: new Date(`${date}T00:00:00.000Z`),
      startAtUtc: bounds.startAtUtc,
      endAtUtc: bounds.endAtUtc,
      startTimeLocal: bounds.startTimeLocal,
      endTimeLocal: bounds.endTimeLocal,
      position: body.position === undefined ? undefined : asString(body.position),
      department: body.department === undefined ? undefined : asString(body.department) || null,
      status: body.status === undefined ? undefined : asString(body.status),
      cancelledAt: asString(body.status) === "CANCELLED" ? new Date() : undefined,
    },
  });
  await rebuildFutureForShift(shift.id);
  return Response.json({ shift });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await prisma.scheduledMessage.deleteMany({ where: { shiftId: id, status: "PENDING" } });
  await prisma.shift.delete({ where: { id } });
  return Response.json({ ok: true });
}
