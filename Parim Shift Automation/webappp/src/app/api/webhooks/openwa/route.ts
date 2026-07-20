import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { normaliseWebhookEvent, isCheckInText, isLateText } from "@/src/lib/openwa/normalise-event";
import { cancelFutureAttendanceMessages } from "@/src/lib/check-in";

function verifySignature(rawBody: string, signature: string | null) {
  if (!env.OPENWA_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", env.OPENWA_WEBHOOK_SECRET).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-openwa-signature");
  if (!verifySignature(rawBody, signature)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  const payload = JSON.parse(rawBody);
  const event = normaliseWebhookEvent(payload);

  let shiftId: string | null = null;
  if (event.direction === "INBOUND" && event.whatsappChatId) {
    const worker = await prisma.worker.findFirst({ where: { whatsappChatId: event.whatsappChatId } });
    const shift = worker
      ? await prisma.shift.findFirst({
          where: {
            workerId: worker.id,
            status: { in: ["SCHEDULED", "CONFIRMED"] },
            endAtUtc: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          },
          orderBy: { startAtUtc: "asc" },
        })
      : null;
    shiftId = shift?.id ?? null;

    if (worker && shift && isCheckInText(event.text)) {
      const updatedShift = await prisma.shift.update({
        where: { id: shift.id },
        data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInSource: "WHATSAPP" },
      });
      await cancelFutureAttendanceMessages(shift.id, "Checked in via WhatsApp reply");
      await prisma.auditLog.create({
        data: {
          actorType: "WHATSAPP",
          action: "SHIFT_CHECKED_IN",
          entityType: "Shift",
          entityId: shift.id,
          afterJson: JSON.stringify(updatedShift),
          metadataJson: JSON.stringify({ workerId: worker.id, text: event.text }),
        },
      });
    } else if (worker && shift && isLateText(event.text)) {
      await prisma.auditLog.create({
        data: {
          actorType: "WHATSAPP",
          action: "WORKER_RUNNING_LATE",
          entityType: "Shift",
          entityId: shift.id,
          metadataJson: JSON.stringify({ workerId: worker.id, text: event.text }),
        },
      });
    }
  }

  await prisma.messageEvent.create({
    data: {
      direction: event.direction,
      eventType: event.eventType,
      whatsappChatId: event.whatsappChatId || "unknown",
      openwaMessageId: event.openwaMessageId,
      text: event.text,
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
      shiftId,
    },
  });

  return Response.json({ ok: true });
}
