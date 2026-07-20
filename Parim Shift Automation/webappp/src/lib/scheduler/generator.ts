import { addMinutes, isBefore } from "date-fns";
import { prisma } from "../prisma";
import { scheduledMessageKey } from "./idempotency";
import { ruleMatchesShift } from "./evaluator";
import { safeJson } from "../utils";
import { buildReminderPlan, isAdvancedReminderRule } from "./reminder-plan";

function anchorForRule(rule: { anchor: string; conditionsJson: string }, shift: { startAtUtc: Date; endAtUtc: Date }) {
  if (rule.anchor === "SHIFT_END") return shift.endAtUtc;
  if (rule.anchor === "SHIFT_CREATED_OR_UPDATED" || rule.anchor === "WORKER_ASSIGNED") return new Date();
  if (rule.anchor === "CUSTOM_DATE_TIME") {
    const conditions = safeJson<{ customDateTimeUtc?: string }>(rule.conditionsJson, {});
    const customDate = conditions.customDateTimeUtc ? new Date(conditions.customDateTimeUtc) : null;
    return customDate && !Number.isNaN(customDate.getTime()) ? customDate : null;
  }
  return shift.startAtUtc;
}

export async function generateForShift(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { worker: true, location: true },
  });
  if (!shift || shift.status === "CANCELLED") return 0;

  const rules = await prisma.triggerRule.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  let created = 0;
  for (const rule of rules) {
    if (!ruleMatchesShift(rule.conditionsJson, shift)) continue;
    const anchor = anchorForRule(rule, shift);
    if (!anchor) continue;
    if (isAdvancedReminderRule(rule.conditionsJson)) {
      const sameSiteWorkerIndex = await getSameSiteWorkerIndex(shift);
      const { plan } = buildReminderPlan({
        ruleId: rule.id,
        conditionsJson: rule.conditionsJson,
        anchor,
        shift: {
          id: shift.id,
          workerId: shift.workerId,
          locationId: shift.locationId,
          startAtUtc: shift.startAtUtc,
          endAtUtc: shift.endAtUtc,
        },
        sameSiteWorkerIndex,
      });

      for (const reminder of plan) {
        const idempotencyKey = scheduledMessageKey({
          shiftId: shift.id,
          workerId: shift.workerId,
          triggerRuleId: rule.id,
          occurrenceNumber: reminder.occurrenceNumber,
          dueAtUtc: reminder.dueAtUtc,
        });
        await prisma.scheduledMessage.upsert({
          where: { idempotencyKey },
          update: {},
          create: {
            shiftId: shift.id,
            workerId: shift.workerId,
            locationId: shift.locationId,
            triggerRuleId: rule.id,
            templateId: rule.templateId,
            occurrenceNumber: reminder.occurrenceNumber,
            plannedIntervalMinutes: reminder.plannedIntervalMinutes,
            dueAtUtc: reminder.dueAtUtc,
            staggerOffsetSeconds: reminder.staggerOffsetSeconds,
            idempotencyKey,
            maximumAttempts: Number(process.env.SCHEDULER_MAX_ATTEMPTS ?? 3),
          },
        });
        created += 1;
      }
      continue;
    }
    const interval = rule.recurrenceIntervalMinutes;
    const maxOccurrences = rule.maximumOccurrences ?? 1;

    for (let occurrenceNumber = 1; occurrenceNumber <= maxOccurrences; occurrenceNumber += 1) {
      const intervalOffset = interval ? interval * (occurrenceNumber - 1) : 0;
      const dueAtUtc = addMinutes(anchor, rule.offsetMinutes + intervalOffset);
      if (rule.recurrenceStop === "SHIFT_START" && !isBefore(dueAtUtc, shift.startAtUtc)) break;
      if (rule.recurrenceStop === "SHIFT_END" && isBefore(shift.endAtUtc, dueAtUtc)) break;
      if (rule.recurrenceStop === "CHECKED_IN" && shift.checkedInAt) break;

      const idempotencyKey = scheduledMessageKey({
        shiftId: shift.id,
        workerId: shift.workerId,
        triggerRuleId: rule.id,
        occurrenceNumber,
        dueAtUtc,
      });

      await prisma.scheduledMessage.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          shiftId: shift.id,
          workerId: shift.workerId,
          locationId: shift.locationId,
          triggerRuleId: rule.id,
          templateId: rule.templateId,
          occurrenceNumber,
          plannedIntervalMinutes: interval ?? Math.abs(rule.offsetMinutes),
          dueAtUtc,
          staggerOffsetSeconds: 0,
          idempotencyKey,
          maximumAttempts: Number(process.env.SCHEDULER_MAX_ATTEMPTS ?? 3),
        },
      });
      created += 1;
      if (!interval) break;
    }
  }
  return created;
}

async function getSameSiteWorkerIndex(shift: { id: string; workerId: string; locationId: string; startAtUtc: Date; endAtUtc: Date }) {
  const sameSite = await prisma.shift.findMany({
    where: {
      locationId: shift.locationId,
      status: { not: "CANCELLED" },
      startAtUtc: { lt: shift.endAtUtc },
      endAtUtc: { gt: shift.startAtUtc },
    },
    include: { worker: true },
    orderBy: [{ startAtUtc: "asc" }, { workerId: "asc" }],
  });
  const ordered = sameSite
    .map((item) => ({ id: item.id, workerName: item.worker.fullName, workerId: item.workerId }))
    .sort((a, b) => a.workerName.localeCompare(b.workerName) || a.workerId.localeCompare(b.workerId));
  return Math.max(0, ordered.findIndex((item) => item.id === shift.id));
}

export async function rebuildFutureForShift(shiftId: string) {
  await prisma.scheduledMessage.deleteMany({
    where: {
      shiftId,
      status: "PENDING",
      dueAtUtc: { gt: new Date() },
    },
  });
  return generateForShift(shiftId);
}

export async function rebuildFutureForAllUpcoming() {
  const shifts = await prisma.shift.findMany({
    where: {
      endAtUtc: { gt: new Date() },
      status: { in: ["SCHEDULED", "CONFIRMED", "ACTIVE"] },
    },
    select: { id: true },
  });
  let total = 0;
  for (const shift of shifts) total += await rebuildFutureForShift(shift.id);
  return total;
}
