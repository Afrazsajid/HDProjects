import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { parseShiftBounds } from "./date-time";
import { normalisePhone } from "./phone";
import type { NormalisedShiftInput } from "./validation";
import { rebuildFutureForShift } from "./scheduler/generator";

function normalise(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sourceFingerprint(source: string, shift: NormalisedShiftInput, phoneE164: string) {
  return createHash("sha256")
    .update([source, normalise(shift.person), shift.date, phoneE164, shift.startTime, shift.endTime, normalise(shift.location), normalise(shift.position)].join(":"))
    .digest("hex");
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? fullName,
    lastName: parts.slice(1).join(" "),
    fullName: fullName.trim(),
  };
}

export async function importNormalisedShifts(source: string, shifts: NormalisedShiftInput[], dryRun = false) {
  const errors: Array<{ row: number; error: string }> = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const batch = dryRun
    ? null
    : await prisma.importBatch.create({ data: { source, rowCount: shifts.length, startedAt: new Date() } });

  for (const [index, shift] of shifts.entries()) {
    try {
      const phone = normalisePhone(shift.phone);
      const names = splitName(shift.person);
      const bounds = parseShiftBounds(shift.date, shift.startTime, shift.endTime);
      const fingerprint = sourceFingerprint(source, shift, phone.e164);
      if (dryRun) {
        importedCount += 1;
        continue;
      }
      const existingWorker = await prisma.worker.findFirst({
        where: { phoneE164: phone.e164, fullName: names.fullName },
      });
      const worker = existingWorker
        ? await prisma.worker.update({
            where: { id: existingWorker.id },
            data: {
              ...names,
              rawPhone: shift.phone,
              whatsappChatId: phone.chatId,
              position: shift.position,
              department: shift.department,
            },
          })
        : await prisma.worker.create({
            data: {
              ...names,
              rawPhone: shift.phone,
              phoneE164: phone.e164,
              whatsappChatId: phone.chatId,
              position: shift.position,
              department: shift.department,
            },
          });
      const location = await prisma.location.upsert({
        where: { normalisedName: normalise(shift.location) },
        update: { name: shift.location },
        create: { name: shift.location, normalisedName: normalise(shift.location) },
      });
      const existing = await prisma.shift.findUnique({ where: { sourceFingerprint: fingerprint } });
      const saved = await prisma.shift.upsert({
        where: { sourceFingerprint: fingerprint },
        update: {
          workerId: worker.id,
          locationId: location.id,
          startAtUtc: bounds.startAtUtc,
          endAtUtc: bounds.endAtUtc,
          startTimeLocal: bounds.startTimeLocal,
          endTimeLocal: bounds.endTimeLocal,
          position: shift.position,
          department: shift.department,
          metadataJson: JSON.stringify({ notes: shift.notes ?? null }),
        },
        create: {
          externalId: shift.externalId,
          source,
          sourceFingerprint: fingerprint,
          workerId: worker.id,
          locationId: location.id,
          shiftDateLocal: new Date(`${shift.date}T00:00:00.000Z`),
          startAtUtc: bounds.startAtUtc,
          endAtUtc: bounds.endAtUtc,
          startTimeLocal: bounds.startTimeLocal,
          endTimeLocal: bounds.endTimeLocal,
          position: shift.position,
          department: shift.department,
          metadataJson: JSON.stringify({ notes: shift.notes ?? null }),
        },
      });
      if (existing) updatedCount += 1;
      else importedCount += 1;
      await rebuildFutureForShift(saved.id);
    } catch (error) {
      skippedCount += 1;
      errors.push({ row: index + 1, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (batch) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedCount,
        updatedCount,
        skippedCount,
        errorCount: errors.length,
        errorsJson: errors.length ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    });
  }

  return { source, rowCount: shifts.length, importedCount, updatedCount, skippedCount, errors, dryRun };
}
