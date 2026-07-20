import { prisma } from "@/src/lib/prisma";

export async function GET() {
  return Response.json({
    messages: await prisma.scheduledMessage.findMany({
      include: { worker: true, triggerRule: true, shift: { include: { location: true } } },
      orderBy: { dueAtUtc: "desc" },
      take: 200,
    }),
  });
}
