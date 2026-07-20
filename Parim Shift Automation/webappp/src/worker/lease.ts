import { addSeconds } from "date-fns";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

export async function acquireOrRenewLease(ownerId: string, name = "scheduler") {
  const now = new Date();
  const expiresAt = addSeconds(now, env.SCHEDULER_LEASE_SECONDS);
  const existing = await prisma.workerLease.findUnique({ where: { name } });
  if (!existing) {
    await prisma.workerLease.create({
      data: { name, ownerId, acquiredAt: now, heartbeatAt: now, expiresAt },
    });
    return true;
  }
  if (existing.ownerId === ownerId || existing.expiresAt < now) {
    await prisma.workerLease.update({
      where: { name },
      data: {
        ownerId,
        acquiredAt: existing.ownerId === ownerId ? existing.acquiredAt : now,
        heartbeatAt: now,
        expiresAt,
      },
    });
    return true;
  }
  return false;
}
