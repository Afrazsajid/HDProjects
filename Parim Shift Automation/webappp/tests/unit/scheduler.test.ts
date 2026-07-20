import { describe, expect, it } from "vitest";
import { scheduledMessageKey } from "@/src/lib/scheduler/idempotency";
import { renderSample } from "@/src/lib/scheduler/renderer";
import { isCheckInText, isLateText } from "@/src/lib/openwa/normalise-event";
import { buildReminderPlan, isAdvancedReminderRule } from "@/src/lib/scheduler/reminder-plan";
import { ruleMatchesShift } from "@/src/lib/scheduler/evaluator";

describe("scheduler primitives", () => {
  it("creates stable idempotency keys", () => {
    const input = {
      shiftId: "shift-1",
      triggerRuleId: "rule-1",
      occurrenceNumber: 1,
      dueAtUtc: new Date("2026-07-20T05:45:00.000Z"),
    };
    expect(scheduledMessageKey(input)).toBe(scheduledMessageKey(input));
  });

  it("includes worker id in idempotency keys", () => {
    const base = {
      shiftId: "shift-1",
      triggerRuleId: "rule-1",
      occurrenceNumber: 1,
      dueAtUtc: new Date("2026-07-20T05:45:00.000Z"),
    };
    expect(scheduledMessageKey({ ...base, workerId: "worker-a" })).not.toBe(scheduledMessageKey({ ...base, workerId: "worker-b" }));
  });

  it("renders supported template variables", () => {
    expect(renderSample("Hi {{firstName}}, {{shiftTime}} at {{location}}")).toBe("Hi Ava, 0645 - 1900 at Heathrow Terminal 5");
  });

  it("keeps attendance reply matching deterministic", () => {
    expect(isCheckInText("ON SITE")).toBe(true);
    expect(isCheckInText("I might be nearby")).toBe(false);
    expect(isLateText("running late")).toBe(true);
  });

  it("matches included locations", () => {
    const shift = sampleShift({ location: "site a" });
    expect(ruleMatchesShift(JSON.stringify({ includeLocations: ["site a", "site b"] }), shift)).toBe(true);
    expect(ruleMatchesShift(JSON.stringify({ includeLocations: ["site c"] }), shift)).toBe(false);
  });

  it("excludes selected locations while allowing all others", () => {
    const shift = sampleShift({ location: "cni" });
    expect(ruleMatchesShift(JSON.stringify({ excludeLocations: ["cni", "durrington"] }), shift)).toBe(false);
    expect(ruleMatchesShift(JSON.stringify({ excludeLocations: ["site a"] }), shift)).toBe(true);
  });

  it("caps intelligent form reminders at 12 per worker", () => {
    const plan = buildReminderPlan(samplePlanInput({ maxRemindersPerWorker: 20, minIntervalMinutes: 15, maxIntervalMinutes: 20 }));
    expect(plan.plan.length).toBeLessThanOrEqual(12);
  });

  it("reduces reminders for short shifts", () => {
    const plan = buildReminderPlan(samplePlanInput({ endAtUtc: new Date("2026-07-20T10:45:00.000Z"), maxRemindersPerWorker: 12, minIntervalMinutes: 15, maxIntervalMinutes: 20 }));
    expect(plan.plan.length).toBeLessThan(12);
    expect(plan.removedAfterShiftEnd.length).toBeGreaterThan(0);
  });

  it("keeps intelligent intervals between configured min and max", () => {
    const plan = buildReminderPlan(samplePlanInput({ minIntervalMinutes: 15, maxIntervalMinutes: 20, maxRemindersPerWorker: 8 }));
    for (const reminder of plan.plan.slice(1)) {
      expect(reminder.plannedIntervalMinutes).toBeGreaterThanOrEqual(15);
      expect(reminder.plannedIntervalMinutes).toBeLessThanOrEqual(20);
    }
  });

  it("keeps generated times stable for the same deterministic seed", () => {
    const first = buildReminderPlan(samplePlanInput({ minIntervalMinutes: 15, maxIntervalMinutes: 20 }));
    const second = buildReminderPlan(samplePlanInput({ minIntervalMinutes: 15, maxIntervalMinutes: 20 }));
    expect(first.plan.map((item) => item.dueAtUtc.toISOString())).toEqual(second.plan.map((item) => item.dueAtUtc.toISOString()));
  });

  it("staggers workers at the same location", () => {
    const first = buildReminderPlan(samplePlanInput({ staggerSameSite: true, minWorkerGapSeconds: 60, staggeringWindowMinutes: 10, sameSiteWorkerIndex: 0 }));
    const second = buildReminderPlan(samplePlanInput({ staggerSameSite: true, minWorkerGapSeconds: 60, staggeringWindowMinutes: 10, sameSiteWorkerIndex: 3 }));
    expect(second.plan[0].staggerOffsetSeconds - first.plan[0].staggerOffsetSeconds).toBe(180);
  });

  it("schedules different locations independently when no same-site index is provided", () => {
    const first = buildReminderPlan(samplePlanInput({ shiftId: "shift-a", locationId: "location-a", staggerSameSite: true }));
    const second = buildReminderPlan(samplePlanInput({ shiftId: "shift-b", locationId: "location-b", staggerSameSite: true }));
    expect(first.plan[0].staggerOffsetSeconds).toBe(0);
    expect(second.plan[0].staggerOffsetSeconds).toBe(0);
  });

  it("supports overnight shifts without scheduling after shift end", () => {
    const plan = buildReminderPlan(samplePlanInput({ startAtUtc: new Date("2026-07-20T22:00:00.000Z"), endAtUtc: new Date("2026-07-21T06:00:00.000Z"), maxRemindersPerWorker: 12 }));
    expect(plan.plan.length).toBeGreaterThan(0);
    expect(plan.plan.every((item) => item.dueAtUtc <= new Date("2026-07-21T06:00:00.000Z"))).toBe(true);
  });

  it("spreads form reminders evenly across each shift length", () => {
    const twelveHour = buildReminderPlan(samplePlanInput({
      reminderPattern: "EVENLY_SPREAD",
      startAtUtc: new Date("2026-07-20T06:00:00.000Z"),
      endAtUtc: new Date("2026-07-20T18:00:00.000Z"),
      maxRemindersPerWorker: 12,
    }));
    expect(twelveHour.plan).toHaveLength(12);
    expect(twelveHour.plan.map((item) => item.plannedIntervalMinutes)).toEqual(Array(12).fill(60));
    expect(twelveHour.plan[0].dueAtUtc.toISOString()).toBe("2026-07-20T07:00:00.000Z");
    expect(twelveHour.plan[11].dueAtUtc.toISOString()).toBe("2026-07-20T18:00:00.000Z");

    const sixHour = buildReminderPlan(samplePlanInput({
      reminderPattern: "EVENLY_SPREAD",
      startAtUtc: new Date("2026-07-20T06:00:00.000Z"),
      endAtUtc: new Date("2026-07-20T12:00:00.000Z"),
      maxRemindersPerWorker: 12,
    }));
    expect(sixHour.plan).toHaveLength(12);
    expect(sixHour.plan.map((item) => item.plannedIntervalMinutes)).toEqual(Array(12).fill(30));
  });

  it("uses the advanced reminder planner only for form reminder rules", () => {
    expect(isAdvancedReminderRule(JSON.stringify({ reminderType: "FORM_REMINDER", reminderPattern: "INTELLIGENT" }))).toBe(true);
    expect(isAdvancedReminderRule(JSON.stringify({ reminderType: "STANDARD", reminderPattern: "INTELLIGENT" }))).toBe(false);
    expect(isAdvancedReminderRule(JSON.stringify({ reminderPattern: "CUSTOM" }))).toBe(false);
  });
});

function sampleShift({ location = "site a", status = "SCHEDULED" } = {}) {
  return {
    status,
    startTimeLocal: "1000",
    endTimeLocal: "1800",
    shiftDateLocal: new Date("2026-07-20T00:00:00.000Z"),
    startAtUtc: new Date("2026-07-20T09:00:00.000Z"),
    endAtUtc: new Date("2026-07-20T17:00:00.000Z"),
    position: "sia",
    department: "security",
    location: { normalisedName: location, name: location },
    worker: { active: true, whatsappOptIn: true, phoneE164: "+447700900123" },
  };
}

function samplePlanInput(options: {
  shiftId?: string;
  workerId?: string;
  locationId?: string;
  startAtUtc?: Date;
  endAtUtc?: Date;
  maxRemindersPerWorker?: number;
  minIntervalMinutes?: number;
  maxIntervalMinutes?: number;
  reminderPattern?: string;
  staggerSameSite?: boolean;
  minWorkerGapSeconds?: number;
  staggeringWindowMinutes?: number;
  sameSiteWorkerIndex?: number;
} = {}) {
  const startAtUtc = options.startAtUtc ?? new Date("2026-07-20T10:00:00.000Z");
  return {
    ruleId: "rule-1",
    conditionsJson: JSON.stringify({
      reminderType: "FORM_REMINDER",
      reminderPattern: options.reminderPattern ?? "INTELLIGENT",
      maxRemindersPerWorker: options.maxRemindersPerWorker ?? 12,
      minIntervalMinutes: options.minIntervalMinutes ?? 15,
      maxIntervalMinutes: options.maxIntervalMinutes ?? 20,
      firstReminderDelayMinutes: 15,
      stopAtShiftEnd: true,
      staggerSameSite: options.staggerSameSite ?? false,
      minWorkerGapSeconds: options.minWorkerGapSeconds ?? 60,
      staggeringWindowMinutes: options.staggeringWindowMinutes ?? 10,
    }),
    anchor: startAtUtc,
    shift: {
      id: options.shiftId ?? "shift-1",
      workerId: options.workerId ?? "worker-1",
      locationId: options.locationId ?? "location-1",
      startAtUtc,
      endAtUtc: options.endAtUtc ?? new Date("2026-07-20T18:00:00.000Z"),
    },
    sameSiteWorkerIndex: options.sameSiteWorkerIndex ?? 0,
  };
}
