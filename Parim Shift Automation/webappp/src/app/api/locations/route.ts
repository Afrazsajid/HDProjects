import { prisma } from "@/src/lib/prisma";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalise(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET() {
  return Response.json({
    locations: await prisma.location.findMany({
      include: { shifts: { include: { worker: true }, orderBy: { startAtUtc: "asc" }, take: 12 } },
      orderBy: { name: "asc" },
      take: 200,
    }),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const name = asString(body.name);
  if (name.length < 2) return Response.json({ error: "Enter a location name." }, { status: 400 });
  const location = await prisma.location.upsert({
    where: { normalisedName: normalise(name) },
    update: {
      name,
      address: asString(body.address) || null,
      postcode: asString(body.postcode) || null,
      timezone: asString(body.timezone) || "Europe/London",
      active: body.active === undefined ? true : Boolean(body.active),
    },
    create: {
      name,
      normalisedName: normalise(name),
      address: asString(body.address) || null,
      postcode: asString(body.postcode) || null,
      timezone: asString(body.timezone) || "Europe/London",
      active: body.active === undefined ? true : Boolean(body.active),
    },
  });
  return Response.json({ location });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const id = asString(body.id);
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Location not found" }, { status: 404 });
  const name = body.name === undefined ? existing.name : asString(body.name);
  const location = await prisma.location.update({
    where: { id },
    data: {
      name,
      normalisedName: normalise(name),
      address: body.address === undefined ? undefined : asString(body.address) || null,
      postcode: body.postcode === undefined ? undefined : asString(body.postcode) || null,
      timezone: body.timezone === undefined ? undefined : asString(body.timezone) || "Europe/London",
      active: body.active === undefined ? undefined : Boolean(body.active),
    },
  });
  return Response.json({ location });
}
