import { describe, expect, it } from "vitest";
import { normalisePhone } from "@/src/lib/phone";

describe("phone normalisation", () => {
  it("normalises common GB mobile formats to E.164 and OpenWA chat ID", () => {
    expect(normalisePhone("07700900123")).toEqual({
      e164: "+447700900123",
      chatId: "447700900123@c.us",
    });
    expect(normalisePhone("447700900123").e164).toBe("+447700900123");
    expect(normalisePhone("+44 7700 900123").chatId).toBe("447700900123@c.us");
  });
});
