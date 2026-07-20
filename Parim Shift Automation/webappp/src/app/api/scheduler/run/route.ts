import { randomUUID } from "node:crypto";
import { processSchedulerTick } from "@/src/worker/scheduler";

export async function POST() {
  const result = await processSchedulerTick(`manual-api-${randomUUID()}`);
  return Response.json(result);
}
