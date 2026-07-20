import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { WorkerManager } from "@/src/components/worker-manager";
import { prisma } from "@/src/lib/prisma";

export default async function WorkersPage() {
  await connection();
  const workers = (await prisma.worker.findMany({ orderBy: { fullName: "asc" }, take: 500 })).map((worker) => ({
    id: worker.id,
    fullName: worker.fullName,
    phoneE164: worker.phoneE164,
    rawPhone: worker.rawPhone,
    position: worker.position,
    department: worker.department,
    active: worker.active,
    whatsappOptIn: worker.whatsappOptIn,
    doNotContact: worker.doNotContact,
    notes: worker.notes,
  }));
  return (
    <>
      <PageHeading title="Workers" description="Create workers, manage phone numbers and control who can receive WhatsApp messages." />
      <WorkerManager workers={workers} />
    </>
  );
}
