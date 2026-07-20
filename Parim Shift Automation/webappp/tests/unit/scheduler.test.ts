import { describe, expect, it } from "vitest";
import { scheduledMessageKey } from "@/src/lib/scheduler/idempotency";
import { renderSample } from "@/src/lib/scheduler/renderer";
import { isCheckInText, isLateText } from "@/src/lib/openwa/normalise-event";

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

  it("renders supported template variables", () => {
    expect(renderSample("Hi {{firstName}}, {{shiftTime}} at {{location}}")).toBe("Hi Ava, 0645 - 1900 at Heathrow Terminal 5");
  });

  it("keeps attendance reply matching deterministic", () => {
    expect(isCheckInText("ON SITE")).toBe(true);
    expect(isCheckInText("I might be nearby")).toBe(false);
    expect(isLateText("running late")).toBe(true);
  });
});
