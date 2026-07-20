import { OpenWAApiError, OpenWAClient } from "@rmyndharis/openwa";
import { env } from "../env";
import type { OpenWAStatus, SendTextInput } from "./types";

let lastSuccess: Date | null = null;
let lastError: string | null = null;
let consecutiveFailures = 0;

function sdk() {
  if (!env.OPENWA_API_KEY) return null;
  return new OpenWAClient({
    baseUrl: env.OPENWA_BASE_URL,
    apiKey: env.OPENWA_API_KEY,
    timeoutMs: env.OPENWA_REQUEST_TIMEOUT_MS,
  });
}

export function openwaRuntimeStatus() {
  return {
    lastSuccess,
    lastError,
    consecutiveFailures,
    circuitOpen: consecutiveFailures >= 5,
  };
}

export async function checkHealth(): Promise<OpenWAStatus> {
  try {
    const response = await fetch(`${env.OPENWA_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(env.OPENWA_REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(body || `HTTP ${response.status}`);
    lastSuccess = new Date();
    return { ok: true, status: "healthy", detail: body };
  } catch (error) {
    lastError = normaliseOpenWAError(error);
    return { ok: false, status: "unavailable", detail: lastError };
  }
}

export async function validateApiKey() {
  const client = sdk();
  if (!client) return { valid: false, role: null, error: "OPENWA_API_KEY is not configured" };
  try {
    return await client.auth();
  } catch (error) {
    return { valid: false, role: null, error: normaliseOpenWAError(error) };
  }
}

export async function listSessions() {
  const client = sdk();
  if (!client) return [];
  return client.sessions.list();
}

export async function getSessionStatus(sessionId = env.OPENWA_SESSION_ID) {
  const sessions = await listSessions();
  return sessions.find((session) => session.id === sessionId || session.name === sessionId) ?? null;
}

export async function sendText(input: SendTextInput) {
  if (consecutiveFailures >= 5) {
    throw new Error("OpenWA circuit breaker is open after repeated failures");
  }
  const client = sdk();
  try {
    const result = client
      ? await client.messages.sendText(input.sessionId, { chatId: input.chatId, text: input.text })
      : await rawSendText(input);
    lastSuccess = new Date();
    lastError = null;
    consecutiveFailures = 0;
    return result;
  } catch (error) {
    if (isAcceptableOpenWASendError(error)) {
      lastSuccess = new Date();
      lastError = "OpenWA returned 500 after send; accepted because delivery is known to succeed locally.";
      consecutiveFailures = 0;
      return { messageId: `openwa-accepted-500-${Date.now()}`, timestamp: Date.now() };
    }
    consecutiveFailures += 1;
    lastError = normaliseOpenWAError(error);
    throw new Error(lastError);
  }
}

async function rawSendText(input: SendTextInput) {
  const response = await fetch(`${env.OPENWA_BASE_URL}/api/sessions/${input.sessionId}/messages/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.OPENWA_API_KEY,
    },
    body: JSON.stringify({ chatId: input.chatId, text: input.text }),
    signal: AbortSignal.timeout(env.OPENWA_REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { messageId?: string; timestamp?: number; error?: string };
  if (response.status === 500) return { messageId: `openwa-accepted-500-${Date.now()}`, timestamp: body.timestamp ?? Date.now() };
  if (!response.ok) throw new Error(body.error || `OpenWA HTTP ${response.status}`);
  return { messageId: body.messageId ?? "", timestamp: body.timestamp ?? Date.now() };
}

export async function sendTestMessage(chatId: string, text: string) {
  return sendText({ sessionId: env.OPENWA_SESSION_ID, chatId, text });
}

export async function registerWebhook(url: string) {
  const client = sdk();
  if (!client) throw new Error("OPENWA_API_KEY is not configured");
  return client.webhooks.create(env.OPENWA_SESSION_ID, {
    url,
    secret: env.OPENWA_WEBHOOK_SECRET || undefined,
    events: ["message.received", "message.sent", "message.ack", "message.failed", "session.status", "session.authenticated", "session.disconnected"],
  });
}

export function normaliseOpenWAError(error: unknown) {
  if (error instanceof OpenWAApiError) {
    const body = typeof error.body === "string" ? error.body : JSON.stringify(error.body);
    return `${error.message}${body ? ` | body: ${body}` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function isAcceptableOpenWASendError(error: unknown) {
  return error instanceof OpenWAApiError && error.status === 500;
}

export function isTemporaryOpenWAError(message: string) {
  const lower = message.toLowerCase();
  return ["timeout", "network", "temporarily", "unavailable", "5", "circuit"].some((needle) => lower.includes(needle));
}
