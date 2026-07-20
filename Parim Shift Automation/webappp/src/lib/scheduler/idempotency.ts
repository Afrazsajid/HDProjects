import { createHash } from "node:crypto";

export function scheduledMessageKey(input: {
  shiftId: string;
  triggerRuleId: string;
  occurrenceNumber: number;
  dueAtUtc: Date;
}) {
  return createHash("sha256")
    .update(`${input.shiftId}:${input.triggerRuleId}:${input.occurrenceNumber}:${input.dueAtUtc.toISOString()}`)
    .digest("hex");
}
