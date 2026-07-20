import { addMinutes, addSeconds, differenceInMinutes, isAfter } from "date-fns";
import { createHash } from "node:crypto";
import { safeJson } from "../utils";

export type ReminderPattern = "FIXED" | "INTELLIGENT" | "CUSTOM" | "EVENLY_SPREAD";

export type AdvancedRuleConditions = {
  reminderType?: "FORM_REMINDER" | "STANDARD";
  reminderPattern?: ReminderPattern;
  maxRemindersPerWorker?: number;
  minIntervalMinutes?: number;
  maxIntervalMinutes?: number;
  firstReminderDelayMinutes?: number;
  customIntervalSequence?: number[];
  stopAtShiftEnd?: boolean;
  stopAfterFormCompletion?: boolean;
  staggerSameSite?: boolean;
  minWorkerGapSeconds?: number;
  staggeringWindowMinutes?: number;
  includeLocations?: string[];
  excludeLocations?: string[];
};

export type PlanInput = {
  ruleId: string;
  conditionsJson: string;
  anchor: Date;
  shift: {
    id: string;
    workerId: string;
    locationId: string;
    startAtUtc: Date;
    endAtUtc: Date;
  };
  sameSiteWorkerIndex?: number;
};

export type PlannedReminder = {
  occurrenceNumber: number;
  plannedIntervalMinutes: number;
  dueAtUtc: Date;
  staggerOffsetSeconds: number;
  removedAfterShiftEnd?: boolean;
};

export function parseAdvancedConditions(conditionsJson: string) {
  return safeJson<AdvancedRuleConditions>(conditionsJson, {});
}

export function isAdvancedReminderRule(conditionsJson: string) {
  const conditions = parseAdvancedConditions(conditionsJson);
  return conditions.reminderType === "FORM_REMINDER";
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function seededUnit(seed: string) {
  const hash = createHash("sha256").update(seed).digest();
  const value = hash.readUInt32BE(0);
  return value / 0xffffffff;
}

function seededInt(seed: string, min: number, max: number) {
  if (max <= min) return min;
  return min + Math.floor(seededUnit(seed) * (max - min + 1));
}

export function siteStaggerSeconds(conditions: AdvancedRuleConditions, sameSiteWorkerIndex = 0) {
  if (!conditions.staggerSameSite) return 0;
  const gapSeconds = clampInt(conditions.minWorkerGapSeconds, 60, 0, 3600);
  const windowSeconds = clampInt(conditions.staggeringWindowMinutes, 10, 0, 240) * 60;
  if (windowSeconds <= 0 || gapSeconds <= 0) return 0;
  return Math.min(windowSeconds, sameSiteWorkerIndex * gapSeconds);
}

export function buildReminderPlan(input: PlanInput) {
  const conditions = parseAdvancedConditions(input.conditionsJson);
  const pattern = conditions.reminderPattern ?? "FIXED";
  const maxReminders = clampInt(conditions.maxRemindersPerWorker, 12, 1, 12);
  const minInterval = clampInt(conditions.minIntervalMinutes, 15, 1, 24 * 60);
  const maxInterval = clampInt(conditions.maxIntervalMinutes, Math.max(20, minInterval), minInterval, 24 * 60);
  const firstDelay = clampInt(conditions.firstReminderDelayMinutes, minInterval, 0, 24 * 60);
  const staggerOffsetSeconds = siteStaggerSeconds(conditions, input.sameSiteWorkerIndex);
  const stopAtShiftEnd = conditions.stopAtShiftEnd !== false;
  const sequence = Array.isArray(conditions.customIntervalSequence) ? conditions.customIntervalSequence.map((value) => clampInt(value, minInterval, 1, 24 * 60)) : [];
  const plan: PlannedReminder[] = [];
  const removed: PlannedReminder[] = [];

  if (pattern === "EVENLY_SPREAD") {
    const windowSeconds = Math.max(0, Math.floor((input.shift.endAtUtc.getTime() - input.anchor.getTime()) / 1000));
    const reminderCount = Math.min(maxReminders, Math.max(0, Math.floor(windowSeconds / 60)));
    if (reminderCount <= 0) return { plan, removedAfterShiftEnd: removed, conditions };
    const intervalSeconds = Math.max(60, Math.floor(windowSeconds / reminderCount));

    for (let occurrenceNumber = 1; occurrenceNumber <= reminderCount; occurrenceNumber += 1) {
      const dueAtUtc = addSeconds(input.anchor, intervalSeconds * occurrenceNumber + staggerOffsetSeconds);
      const reminder: PlannedReminder = {
        occurrenceNumber,
        plannedIntervalMinutes: Math.max(1, Math.round(intervalSeconds / 60)),
        dueAtUtc,
        staggerOffsetSeconds,
      };
      if (stopAtShiftEnd && isAfter(dueAtUtc, input.shift.endAtUtc)) {
        removed.push({ ...reminder, removedAfterShiftEnd: true });
        continue;
      }
      plan.push(reminder);
    }

    return { plan, removedAfterShiftEnd: removed, conditions };
  }

  let elapsed = 0;
  const shiftMinutes = Math.max(0, differenceInMinutes(input.shift.endAtUtc, input.anchor));
  for (let occurrenceNumber = 1; occurrenceNumber <= maxReminders; occurrenceNumber += 1) {
    let interval: number;
    if (pattern === "CUSTOM" && sequence.length) {
      interval = sequence[Math.min(occurrenceNumber - 1, sequence.length - 1)] ?? minInterval;
    } else if (pattern === "INTELLIGENT") {
      interval = occurrenceNumber === 1 ? firstDelay : seededInt(`${input.ruleId}:${input.shift.id}:${input.shift.workerId}:${occurrenceNumber}`, minInterval, maxInterval);
    } else {
      interval = occurrenceNumber === 1 ? firstDelay : minInterval;
    }

    elapsed += interval;
    const dueAtUtc = addSeconds(addMinutes(input.anchor, elapsed), staggerOffsetSeconds);
    const reminder: PlannedReminder = { occurrenceNumber, plannedIntervalMinutes: interval, dueAtUtc, staggerOffsetSeconds };
    if ((stopAtShiftEnd && isAfter(dueAtUtc, input.shift.endAtUtc)) || elapsed > shiftMinutes + Math.ceil(staggerOffsetSeconds / 60)) {
      removed.push({ ...reminder, removedAfterShiftEnd: true });
      break;
    }
    plan.push(reminder);
  }

  return { plan, removedAfterShiftEnd: removed, conditions };
}

export function humaniseLocationSummary(locations: { normalisedName: string; name: string }[], includeLocations?: string[], excludeLocations?: string[]) {
  const nameFor = (normalisedName: string) => locations.find((location) => location.normalisedName === normalisedName)?.name ?? normalisedName;
  const included = includeLocations?.map(nameFor) ?? [];
  const excluded = excludeLocations?.map(nameFor) ?? [];
  if (included.length && excluded.length) return `only ${included.join(", ")} except ${excluded.join(", ")}`;
  if (included.length) return `only ${included.join(", ")}`;
  if (excluded.length) return `all locations except ${excluded.join(", ")}`;
  return "all locations";
}
