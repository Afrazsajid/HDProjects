import { rebuildFutureForAllUpcoming } from "@/src/lib/scheduler/generator";

export async function POST() {
  const generated = await rebuildFutureForAllUpcoming();
  return Response.json({ generated });
}
