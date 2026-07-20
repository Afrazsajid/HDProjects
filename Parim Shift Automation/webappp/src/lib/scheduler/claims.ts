import { addMinutes, subMinutes } from "date-fns";
import { prisma } from "../prisma";
import { env } from "../env";

export async function releaseStuckMessages() {
  const staleBefore = subMinutes(new Date(), env.SCHEDULER_PROCESSING_TIMEOUT_MINUTES);
  return prisma.scheduledMessage.updateMany({
    where: {
      status: "PROCESSING",
      processingStartedAt: { lt: staleBefore },
    },
    data: {
      status: "PENDING",
      processingStartedAt: null,
      claimedBy: null,
      lastError: "Released after processing timeout",
    },
  });
}

export async function claimDueMessages(ownerId: string, limit = 10) {
  const now = new Date();
  const due = await prisma.scheduledMessage.findMany({
    where: {
      status: "PENDING",
      dueAtUtc: { lte: now },
    },
    orderBy: { dueAtUtc: "asc" },
    take: limit,
    select: { id: true },
  });

  const claimed = [];
  for (const message of due) {
    const updated = await prisma.scheduledMessage.updateMany({
      where: { id: message.id, status: "PENDING" },
      data: {
        status: "PROCESSING",
        processingStartedAt: now,
        claimedBy: ownerId,
      },
    });
    if (updated.count === 1) {
      const loaded = await prisma.scheduledMessage.findUnique({
        where: { id: message.id },
        include: {
          shift: { include: { worker: true, location: true } },
          worker: true,
          triggerRule: true,
          template: true,
        },
      });
      if (loaded) claimed.push(loaded);
    }
  }
  return claimed;
}

export async function skipOverdueMessages() {
  const cutoff = addMinutes(new Date(), -env.SCHEDULER_OVERDUE_GRACE_MINUTES);
  return prisma.scheduledMessage.updateMany({
    where: {
      status: "PENDING",
      dueAtUtc: { lt: cutoff },
    },
    data: {
      status: "SKIPPED",
      lastError: `Skipped because due time exceeded ${env.SCHEDULER_OVERDUE_GRACE_MINUTES} minute grace period`,
      cancellationReason: `Due time exceeded ${env.SCHEDULER_OVERDUE_GRACE_MINUTES} minute grace period`,
    },
  });
}
