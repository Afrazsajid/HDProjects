import { listSessions } from "@/src/lib/openwa/client";

export async function GET() {
  return Response.json({ sessions: await listSessions() });
}
