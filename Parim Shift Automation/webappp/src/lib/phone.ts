import { createRequire } from "node:module";
import type { CountryCode, PhoneNumber } from "libphonenumber-js";
import { env } from "./env";

const require = createRequire(import.meta.url);
const parsePhoneNumberFromString = require("libphonenumber-js/max") as (
  input: string,
  defaultCountry: CountryCode,
) => PhoneNumber | undefined;

export type NormalisedPhone = {
  e164: string;
  chatId: string;
};

export function normalisePhone(input: string, defaultCountry = env.DEFAULT_COUNTRY): NormalisedPhone {
  try {
    const phone = parsePhoneNumberFromString(input, defaultCountry as CountryCode);
    if (phone?.isValid()) {
      const e164 = phone.number;
      return {
        e164,
        chatId: `${e164.replace("+", "")}@c.us`,
      };
    }
  } catch {
    // Fall through to the deterministic GB fallback below.
  }
  const digits = input.replace(/\D/g, "");
  const e164 =
    defaultCountry === "GB" && digits.startsWith("0")
      ? `+44${digits.slice(1)}`
      : digits.startsWith("44")
        ? `+${digits}`
        : input.trim().startsWith("+")
          ? `+${digits}`
          : "";
  if (!/^\+\d{10,15}$/.test(e164)) throw new Error(`Invalid phone number: ${input}`);
  return {
    e164,
    chatId: `${e164.replace("+", "")}@c.us`,
  };
}

export function normaliseChatId(input: string) {
  const value = input.trim();
  if (value.endsWith("@c.us")) return value;
  const digits = value.replace(/\D/g, "");
  return `${digits}@c.us`;
}
