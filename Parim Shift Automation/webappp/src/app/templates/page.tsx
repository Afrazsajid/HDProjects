import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { TemplateManager } from "@/src/components/template-manager";
import { prisma } from "@/src/lib/prisma";

export default async function TemplatesPage() {
  await connection();
  const templates = (await prisma.messageTemplate.findMany({
    include: { _count: { select: { triggerRules: true } } },
    orderBy: { name: "asc" },
  })).map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    content: template.content,
    active: template.active,
    systemTemplate: template.systemTemplate,
    _count: template._count,
  }));
  return (
    <>
      <PageHeading title="Templates" description="Create, preview, duplicate, activate and manage WhatsApp message wording in plain English." />
      <TemplateManager templates={templates} />
    </>
  );
}
