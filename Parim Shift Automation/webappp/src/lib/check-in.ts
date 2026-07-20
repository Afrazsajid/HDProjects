import { createHash, randomBytes } from "node:crypto";
import { addMinutes } from "date-fns";
import { prisma } from "./prisma";
import { env } from "./env";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function buildCheckInToken(shiftId: string, workerId: string, shiftEndAtUtc: Date, forceNew = false) {
  if (!forceNew) {
    const existing = await prisma.checkInToken.findFirst({
      where: { shiftId, workerId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) return { token: null, tokenHash: existing.tokenHash };
  }
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  await prisma.checkInToken.create({
    data: {
      shiftId,
      workerId,
      tokenHash,
      expiresAt: addMinutes(shiftEndAtUtc, env.CHECK_IN_GRACE_MINUTES),
    },
  });
  return { token, tokenHash };
}

export async function cancelFutureAttendanceMessages(shiftId: string, reason: string) {
  const now = new Date();
  return prisma.scheduledMessage.updateMany({
    where: {
      shiftId,
      status: "PENDING",
      triggerRule: {
        recurrenceStop: "CHECKED_IN",
      },
      dueAtUtc: { gt: now },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancellationReason: reason,
      lastError: reason,
    },
  });
}
