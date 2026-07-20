import { startOfDay, endOfDay, addHours } from "date-fns";
import { connection } from "next/server";
import { prisma } from "./prisma";

export async function getDashboardData() {
  await connection();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const [
    shiftsToday,
    checkedInToday,
    dueSoon,
    sentToday,
    failedToday,
    pendingMessages,
    lastImport,
    upcomingShifts,
    upcomingMessages,
    failedMessages,
    inboundReplies,
    lease,
    activeRules,
    inactiveRules,
    repeatingRules,
    rules,
  ] = await Promise.all([
    prisma.shift.count({ where: { startAtUtc: { gte: todayStart, lte: todayEnd } } }),
    prisma.shift.count({ where: { checkedInAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.scheduledMessage.count({ where: { status: "PENDING", dueAtUtc: { gte: now, lte: addHours(now, 2) } } }),
    prisma.scheduledMessage.count({ where: { status: "SENT", sentAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.scheduledMessage.count({ where: { status: "FAILED", failedAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.scheduledMessage.count({ where: { status: "PENDING" } }),
    prisma.importBatch.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.shift.findMany({
      where: { startAtUtc: { gte: todayStart, lte: todayEnd } },
      include: { worker: true, location: true },
      orderBy: { startAtUtc: "asc" },
      take: 8,
    }),
    prisma.scheduledMessage.findMany({
      where: { status: "PENDING" },
      include: { worker: true, triggerRule: true, shift: { include: { location: true } } },
      orderBy: { dueAtUtc: "asc" },
      take: 8,
    }),
    prisma.scheduledMessage.findMany({
      where: { status: "FAILED" },
      include: { worker: true, triggerRule: true },
      orderBy: { failedAt: "desc" },
      take: 6,
    }),
    prisma.messageEvent.findMany({
      where: { direction: "INBOUND" },
      orderBy: { occurredAt: "desc" },
      take: 6,
    }),
    prisma.workerLease.findUnique({ where: { name: "scheduler" } }),
    prisma.triggerRule.count({ where: { enabled: true } }),
    prisma.triggerRule.count({ where: { enabled: false } }),
    prisma.triggerRule.count({ where: { recurrenceIntervalMinutes: { not: null } } }),
    prisma.triggerRule.findMany({
      include: {
        template: true,
        scheduledMessages: { where: { status: "PENDING", dueAtUtc: { gte: now } }, orderBy: { dueAtUtc: "asc" }, take: 1 },
      },
      orderBy: [{ enabled: "desc" }, { priority: "asc" }],
      take: 12,
    }),
  ]);
  return {
    metrics: { shiftsToday, checkedInToday, dueSoon, sentToday, failedToday, pendingMessages, activeRules, inactiveRules, repeatingRules },
    lastImport,
    upcomingShifts,
    upcomingMessages,
    failedMessages,
    inboundReplies,
    lease,
    rules,
  };
}
