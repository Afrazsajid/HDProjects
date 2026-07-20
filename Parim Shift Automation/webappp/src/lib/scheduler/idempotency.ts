import { createHash } from "node:crypto";

export function scheduledMessageKey(input: {
  shiftId: string;
  workerId?: string;
  triggerRuleId: string;
  occurrenceNumber: number;
  dueAtUtc: Date;
}) {
  return createHash("sha256")
    .update(`${input.shiftId}:${input.triggerRuleId}:${input.workerId ?? ""}:${input.occurrenceNumber}:${input.dueAtUtc.toISOString()}`)
    .digest("hex");
}
