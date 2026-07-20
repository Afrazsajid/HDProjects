export type ShiftTimingStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";

export function getShiftTimingStatus(
  shift: { status: string; startAtUtc: Date; endAtUtc: Date; cancelledAt?: Date | null },
  now = new Date(),
): ShiftTimingStatus {
  if (shift.status === "CANCELLED" || shift.cancelledAt) return "CANCELLED";
  if (now < shift.startAtUtc) return "UPCOMING";
  if (now <= shift.endAtUtc) return "ACTIVE";
  return "ENDED";
}

export function getShiftDisplayStatus(
  shift: { status: string; startAtUtc: Date; endAtUtc: Date; checkedInAt?: Date | null; cancelledAt?: Date | null },
  now = new Date(),
) {
  if (shift.status === "CANCELLED" || shift.cancelledAt) return "CANCELLED";
  if (shift.checkedInAt || shift.status === "CHECKED_IN") return "CHECKED IN";
  return getShiftTimingStatus(shift, now);
}

import type { PrismaClient } from "@/src/generated/prisma/client";

export async function updateShiftStatuses(prisma: Pick<PrismaClient, "shift">) {
  const now = new Date();
  const activated = await prisma.shift.updateMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      startAtUtc: { lte: now },
      endAtUtc: { gt: now },
      cancelledAt: null,
    },
    data: { status: "ACTIVE" },
  });
  const completed = await prisma.shift.updateMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED", "ACTIVE", "CHECKED_IN"] },
      endAtUtc: { lte: now },
      cancelledAt: null,
    },
    data: { status: "COMPLETED" },
  });
  return { activated: activated.count, completed: completed.count };
}
