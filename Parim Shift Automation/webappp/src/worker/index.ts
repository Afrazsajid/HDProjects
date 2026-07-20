import { randomUUID } from "node:crypto";
import { bootstrapDatabase } from "../lib/prisma";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { processSchedulerTick } from "./scheduler";

const ownerId = `worker-${process.pid}-${randomUUID()}`;

async function main() {
  await bootstrapDatabase();
  log("info", "worker", "scheduler started", { ownerId, intervalMs: env.SCHEDULER_INTERVAL_MS });
  while (true) {
    try {
      const result = await processSchedulerTick(ownerId);
      log("debug", "worker", "scheduler tick complete", result);
    } catch (error) {
      log("error", "worker", "scheduler tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, env.SCHEDULER_INTERVAL_MS));
  }
}

void main();
