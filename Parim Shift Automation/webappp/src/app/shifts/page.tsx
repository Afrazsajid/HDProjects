import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { ShiftManager } from "@/src/components/shift-manager";
import { prisma } from "@/src/lib/prisma";
import { getShiftDisplayStatus } from "@/src/lib/shifts/status";
import { updateShiftStatuses } from "@/src/lib/shifts/status";

export default async function ShiftsPage() {
  await connection();
  await updateShiftStatuses(prisma);
  const [shiftsRaw, workersRaw, locationsRaw] = await Promise.all([
    prisma.shift.findMany({ include: { worker: true, location: true }, orderBy: { startAtUtc: "asc" }, take: 500 }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { fullName: "asc" }, take: 500 }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  const shifts = shiftsRaw.map((shift) => ({
    id: shift.id,
    shiftDateLocal: shift.shiftDateLocal.toISOString().slice(0, 10),
    startTimeLocal: shift.startTimeLocal,
    endTimeLocal: shift.endTimeLocal,
    position: shift.position,
    department: shift.department,
    status: getShiftDisplayStatus(shift),
    storedStatus: shift.status,
    worker: { id: shift.worker.id, fullName: shift.worker.fullName },
    location: { id: shift.location.id, name: shift.location.name },
  }));
  const workers = workersRaw.map((worker) => ({ id: worker.id, fullName: worker.fullName }));
  const locations = locationsRaw.map((location) => ({ id: location.id, name: location.name }));
  return (
    <>
      <PageHeading title="Shifts" description="Create, copy, cancel and delete shifts. Active messaging rules are applied when a shift is saved." />
      <ShiftManager shifts={shifts} workers={workers} locations={locations} />
    </>
  );
}
