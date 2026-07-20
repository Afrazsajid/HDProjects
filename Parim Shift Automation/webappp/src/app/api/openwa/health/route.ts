import { checkHealth, validateApiKey, getSessionStatus, openwaRuntimeStatus } from "@/src/lib/openwa/client";

export async function GET() {
  const [health, key, session] = await Promise.all([checkHealth(), validateApiKey(), getSessionStatus().catch(() => null)]);
  return Response.json({ health, key, session, runtime: openwaRuntimeStatus() });
}
