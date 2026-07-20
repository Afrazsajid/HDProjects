import { addMilliseconds } from "date-fns";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { buildCheckInToken, cancelFutureAttendanceMessages } from "../lib/check-in";
import { checkHealth, getSessionStatus, isTemporaryOpenWAError, sendText } from "../lib/openwa/client";
import { claimDueMessages, releaseStuckMessages, skipOverdueMessages } from "../lib/scheduler/claims";
import { renderTemplate } from "../lib/scheduler/renderer";
import { updateShiftStatuses } from "../lib/shifts/status";
import { parseAdvancedConditions } from "../lib/scheduler/reminder-plan";
import { log } from "../lib/logger";
import { acquireOrRenewLease } from "./lease";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendingPaused() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "emergencyPauseSending" } });
  return setting?.value === "true";
}

function retryDelay(attempts: number) {
  const base = Math.min(60000, 1000 * 2 ** attempts);
  return base + Math.floor(Math.random() * 1000);
}

export async function processSchedulerTick(ownerId: string) {
  const hasLease = await acquireOrRenewLease(ownerId);
  if (!hasLease) return { processed: 0, skipped: "lease-held-by-another-worker" };

  await releaseStuckMessages();
  await skipOverdueMessages();
  const shiftStatusUpdates = await updateShiftStatuses(prisma);

  if (await sendingPaused()) return { processed: 0, skipped: "emergency-pause", activatedShifts: shiftStatusUpdates.activated, completedShifts: shiftStatusUpdates.completed };

  const health = await checkHealth();
  const session = await getSessionStatus().catch(() => null);
  if (!health.ok || !session || !["ready", "connected"].includes(session.status)) {
    await prisma.scheduledMessage.updateMany({
      where: { status: "PENDING", dueAtUtc: { lte: new Date() } },
      data: { lastError: `OpenWA unavailable: ${health.detail ?? session?.status ?? "no session"}` },
    });
    return { processed: 0, skipped: "openwa-unavailable", activatedShifts: shiftStatusUpdates.activated, completedShifts: shiftStatusUpdates.completed };
  }

  const messages = await claimDueMessages(ownerId, Math.max(1, Math.floor(env.OPENWA_MAX_MESSAGES_PER_MINUTE / 4)));
  let processed = 0;

  for (const message of messages) {
    try {
      if (message.claimedBy !== ownerId || message.status !== "PROCESSING") continue;
      if (message.shift.status === "CANCELLED") throw new PermanentSkip("Shift is cancelled");
      if (!message.worker.active) throw new PermanentSkip("Worker is inactive");
      if (!message.worker.whatsappOptIn || message.worker.doNotContact) throw new PermanentSkip("Worker is not contactable");
      if (!message.worker.whatsappChatId) throw new PermanentSkip("Worker has no WhatsApp chat ID");
      if (!message.triggerRule.enabled) throw new PermanentSkip("Trigger rule is disabled");
      const advancedConditions = parseAdvancedConditions(message.triggerRule.conditionsJson);
      if ((message.triggerRule.recurrenceStop === "CHECKED_IN" || advancedConditions.stopAfterFormCompletion) && message.shift.checkedInAt) {
        throw new PermanentSkip("Worker is already checked in or form is complete");
      }
      if (advancedConditions.stopAfterFormCompletion) {
        const completedForms = await prisma.attendanceResponse.count({ where: { shiftId: message.shiftId, workerId: message.workerId } });
        if (completedForms > 0) throw new PermanentSkip("Worker form is already complete");
      }

      const checkInToken = message.template.content.includes("{{checkInUrl}}")
        ? (await buildCheckInToken(message.shiftId, message.workerId, message.shift.endAtUtc, true)).token
        : null;

      const renderedText = renderTemplate({
        template: message.template.content,
        shift: message.shift,
        checkInToken,
      });

      const result = await sendText({
        sessionId: env.OPENWA_SESSION_ID,
        chatId: message.worker.whatsappChatId,
        text: renderedText,
      });

      await prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          renderedText,
          openwaMessageId: result.messageId,
          sentAt: new Date(),
          lastError: null,
        },
      });
      await prisma.messageEvent.create({
        data: {
          scheduledMessageId: message.id,
          shiftId: message.shiftId,
          direction: "OUTBOUND",
          eventType: "message.sent",
          whatsappChatId: message.worker.whatsappChatId,
          openwaMessageId: result.messageId,
          text: renderedText,
          payloadJson: JSON.stringify(result),
          occurredAt: new Date(),
        },
      });
      processed += 1;
      await sleep(env.OPENWA_MIN_DELAY_MS);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentSkip) {
        await prisma.scheduledMessage.update({
          where: { id: message.id },
          data: { status: "SKIPPED", lastError: errorMessage, cancellationReason: errorMessage, processingStartedAt: null, claimedBy: null },
        });
        continue;
      }
      const attempts = message.attempts + 1;
      const failed = attempts >= message.maximumAttempts || !isTemporaryOpenWAError(errorMessage);
      await prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          failedAt: failed ? new Date() : null,
          dueAtUtc: failed ? message.dueAtUtc : addMilliseconds(new Date(), retryDelay(attempts)),
          processingStartedAt: null,
          claimedBy: null,
          lastError: errorMessage,
        },
      });
      log(failed ? "error" : "warn", "scheduler", "message send failed", {
        scheduledMessageId: message.id,
        shiftId: message.shiftId,
        error: errorMessage,
      });
    }
  }
  return { processed, activatedShifts: shiftStatusUpdates.activated, completedShifts: shiftStatusUpdates.completed };
}

class PermanentSkip extends Error {}

export async function applyWhatsappCheckIn(shiftId: string, workerId: string, source: "WHATSAPP" | "FORM") {
  const now = new Date();
  const shift = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      status: "CHECKED_IN",
      checkedInAt: now,
      checkedInSource: source,
    },
  });
  await cancelFutureAttendanceMessages(shiftId, `Checked in via ${source}`);
  await prisma.auditLog.create({
    data: {
      actorType: source,
      action: "SHIFT_CHECKED_IN",
      entityType: "Shift",
      entityId: shiftId,
      afterJson: JSON.stringify(shift),
      metadataJson: JSON.stringify({ workerId }),
    },
  });
}
