import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { RuleManager } from "@/src/components/rule-manager";
import { prisma } from "@/src/lib/prisma";

export default async function RulesPage() {
  await connection();
  const [rulesRaw, templatesRaw, locationsRaw] = await Promise.all([
    prisma.triggerRule.findMany({ include: { template: true }, orderBy: { priority: "asc" } }),
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const templates = templatesRaw.map((template) => ({
    id: template.id,
    name: template.name,
    content: template.content,
    active: template.active,
  }));
  const rules = rulesRaw.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    anchor: rule.anchor,
    offsetMinutes: rule.offsetMinutes,
    recurrenceIntervalMinutes: rule.recurrenceIntervalMinutes,
    maximumOccurrences: rule.maximumOccurrences,
    recurrenceStop: rule.recurrenceStop,
    priority: rule.priority,
    templateId: rule.templateId,
    conditionsJson: rule.conditionsJson,
    template: {
      id: rule.template.id,
      name: rule.template.name,
      content: rule.template.content,
      active: rule.template.active,
    },
  }));
  const locations = locationsRaw.map((location) => ({
    id: location.id,
    name: location.name,
    normalisedName: location.normalisedName,
  }));
  return (
    <>
      <PageHeading title="Rules" description="Plain-English automation builder for shift reminders, repeats, stop conditions and location filters." />
      <RuleManager rules={rules} templates={templates} locations={locations} />
    </>
  );
}
