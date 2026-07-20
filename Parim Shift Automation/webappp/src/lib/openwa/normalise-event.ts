import { z } from "zod";
import { normaliseChatId } from "../phone";

export const openwaWebhookEventSchema = z.object({
  event: z.string().optional(),
  type: z.string().optional(),
  sessionId: z.string().optional(),
  message: z
    .object({
      id: z.string().optional(),
      body: z.string().optional(),
      text: z.string().optional(),
      from: z.string().optional(),
      chatId: z.string().optional(),
      fromMe: z.boolean().optional(),
      timestamp: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough()
    .optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export function normaliseWebhookEvent(payload: unknown) {
  const parsed = openwaWebhookEventSchema.parse(payload);
  const eventType = parsed.event ?? parsed.type ?? "unknown";
  const message = parsed.message ?? (parsed.data as Record<string, unknown> | undefined);
  const rawChat = String(message?.chatId ?? message?.from ?? "");
  const text = String(message?.body ?? message?.text ?? "");
  return {
    eventType,
    whatsappChatId: rawChat ? normaliseChatId(rawChat) : "",
    openwaMessageId: message?.id ? String(message.id) : null,
    text,
    direction: eventType === "message.received" ? "INBOUND" : "SYSTEM",
    occurredAt: new Date(typeof message?.timestamp === "number" ? Number(message.timestamp) * 1000 : Date.now()),
    payloadJson: JSON.stringify(payload),
  };
}

export function isCheckInText(text: string) {
  return /^(YES|Y|ON\s?SITE|ARRIVED|I AM HERE|HERE)$/i.test(text.trim());
}

export function isLateText(text: string) {
  return /^(LATE|RUNNING LATE|DELAYED)$/i.test(text.trim());
}
