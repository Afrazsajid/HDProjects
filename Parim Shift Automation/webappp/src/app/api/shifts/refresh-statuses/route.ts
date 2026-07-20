import { prisma } from "@/src/lib/prisma";
import { updateShiftStatuses } from "@/src/lib/shifts/status";

export async function POST() {
  return Response.json(await updateShiftStatuses(prisma));
}
