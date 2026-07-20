import { describe, expect, it } from "vitest";
import { parseShiftBounds, parseShiftTimeRange } from "@/src/lib/date-time";

describe("date-time helpers", () => {
  it("parses compact PARiM shift ranges", () => {
    expect(parseShiftTimeRange("0645 - 1900")).toEqual({
      startTimeLocal: "0645",
      endTimeLocal: "1900",
    });
  });

  it("rolls overnight shifts into the next UTC end date", () => {
    const bounds = parseShiftBounds("2026-07-20", "2300", "0800");
    expect(bounds.endAtUtc.getTime()).toBeGreaterThan(bounds.startAtUtc.getTime());
  });
});
