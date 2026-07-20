import { prisma } from "@/src/lib/prisma";
import { normalisePhone } from "@/src/lib/phone";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName, lastName: parts.slice(1).join(" "), fullName: fullName.trim() };
}

export async function GET() {
  return Response.json({
    workers: await prisma.worker.findMany({
      include: {
        shifts: { include: { location: true }, orderBy: { startAtUtc: "desc" }, take: 10 },
        scheduledMessages: { orderBy: { dueAtUtc: "desc" }, take: 10 },
      },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const fullName = asString(body.fullName);
  const rawPhone = asString(body.phone);
  if (fullName.length < 2) return Response.json({ error: "Enter the worker name." }, { status: 400 });
  if (rawPhone.length < 5) return Response.json({ error: "Enter a phone number." }, { status: 400 });
  const phone = normalisePhone(rawPhone);
  const worker = await prisma.worker.create({
    data: {
      ...splitName(fullName),
      rawPhone,
      phoneE164: phone.e164,
      whatsappChatId: phone.chatId,
      position: asString(body.position) || null,
      department: asString(body.department) || null,
      notes: asString(body.notes) || null,
      active: body.active === undefined ? true : Boolean(body.active),
      whatsappOptIn: body.whatsappOptIn === undefined ? true : Boolean(body.whatsappOptIn),
    },
  });
  return Response.json({ worker });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const id = asString(body.id);
  const existing = await prisma.worker.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Worker not found" }, { status: 404 });
  const fullName = body.fullName === undefined ? existing.fullName : asString(body.fullName);
  const rawPhone = body.phone === undefined ? existing.rawPhone : asString(body.phone);
  const phone = normalisePhone(rawPhone);
  const worker = await prisma.worker.update({
    where: { id },
    data: {
      ...splitName(fullName),
      rawPhone,
      phoneE164: phone.e164,
      whatsappChatId: phone.chatId,
      position: body.position === undefined ? undefined : asString(body.position) || null,
      department: body.department === undefined ? undefined : asString(body.department) || null,
      notes: body.notes === undefined ? undefined : asString(body.notes) || null,
      active: body.active === undefined ? undefined : Boolean(body.active),
      whatsappOptIn: body.whatsappOptIn === undefined ? undefined : Boolean(body.whatsappOptIn),
      doNotContact: body.doNotContact === undefined ? undefined : Boolean(body.doNotContact),
    },
  });
  return Response.json({ worker });
}
