import { prisma } from "@/src/lib/prisma";
import { renderSample } from "@/src/lib/scheduler/renderer";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  return Response.json({
    templates: await prisma.messageTemplate.findMany({
      include: { _count: { select: { triggerRules: true } } },
      orderBy: { name: "asc" },
    }),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  if (body.action === "duplicate") {
    const id = asString(body.id);
    const source = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!source) return Response.json({ error: "Template not found" }, { status: 404 });
    const template = await prisma.messageTemplate.create({
      data: {
        name: `${source.name} copy`,
        description: source.description,
        content: source.content,
        active: false,
      },
    });
    return Response.json({ template, preview: renderSample(template.content) });
  }

  const name = asString(body.name);
  const content = asString(body.content);
  if (name.length < 2) return Response.json({ error: "Enter a template name." }, { status: 400 });
  if (content.length < 5) return Response.json({ error: "Enter the message text." }, { status: 400 });

  const template = await prisma.messageTemplate.create({
    data: {
      name,
      content,
      description: asString(body.description) || null,
      active: body.active === undefined ? true : Boolean(body.active),
    },
  });
  return Response.json({ template, preview: renderSample(template.content) });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const id = asString(body.id);
  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Template not found" }, { status: 404 });

  const template = await prisma.messageTemplate.update({
    where: { id },
    data: {
      name: body.name === undefined ? undefined : asString(body.name),
      description: body.description === undefined ? undefined : asString(body.description) || null,
      content: body.content === undefined ? undefined : asString(body.content),
      active: body.active === undefined ? undefined : Boolean(body.active),
    },
  });
  return Response.json({ template, preview: renderSample(template.content) });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const usage = await prisma.triggerRule.count({ where: { templateId: id } });
  if (usage > 0) {
    return Response.json({ error: "This template is used by rules. Deactivate it or move those rules to another template first." }, { status: 409 });
  }
  await prisma.messageTemplate.delete({ where: { id } });
  return Response.json({ ok: true });
}
