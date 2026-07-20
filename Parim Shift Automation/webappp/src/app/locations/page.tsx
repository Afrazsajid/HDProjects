import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { LocationManager } from "@/src/components/location-manager";
import { prisma } from "@/src/lib/prisma";

export default async function LocationsPage() {
  await connection();
  const now = new Date();
  const locationsRaw = await prisma.location.findMany({
    include: { _count: { select: { shifts: { where: { endAtUtc: { gt: now }, status: { not: "CANCELLED" } } } } } },
    orderBy: { name: "asc" },
    take: 500,
  });
  const locations = locationsRaw.map((location) => ({
    id: location.id,
    name: location.name,
    address: location.address,
    postcode: location.postcode,
    timezone: location.timezone,
    active: location.active,
    upcomingCount: location._count.shifts,
  }));
  return (
    <>
      <PageHeading title="Locations" description="Create locations, store addresses and filter shifts, workers and messages by venue." />
      <LocationManager locations={locations} />
    </>
  );
}
