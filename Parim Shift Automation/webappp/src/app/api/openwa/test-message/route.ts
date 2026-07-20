import { z } from "zod";
import { sendTestMessage } from "@/src/lib/openwa/client";

const testMessageSchema = z.object({
  chatId: z.string().min(8),
  text: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  try {
    const body = testMessageSchema.parse(await request.json());
    const result = await sendTestMessage(body.chatId, body.text);
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
