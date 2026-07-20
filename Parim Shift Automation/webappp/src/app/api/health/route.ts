import { prisma } from "@/src/lib/prisma";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({
    ok: true,
    service: "H&D Shift Messenger",
    timestamp: new Date().toISOString(),
  });
}
