import { format, toZonedTime, fromZonedTime } from "date-fns-tz";
import { addMinutes, differenceInMinutes, parseISO } from "date-fns";
import { env } from "./env";

export function normaliseTime(value: string) {
  const trimmed = value.trim().toUpperCase();
  const ampm = trimmed.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] ?? "00");
    if (ampm[3] === "PM" && hour < 12) hour += 12;
    if (ampm[3] === "AM" && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, "0")}${minute.toString().padStart(2, "0")}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 3) return `0${digits}`;
  if (digits.length === 4) return digits;
  throw new Error(`Invalid time: ${value}`);
}

export function parseShiftTimeRange(value: string) {
  const [startRaw, endRaw] = value.split(/\s*-\s*/);
  if (!startRaw || !endRaw) throw new Error(`Invalid shift time range: ${value}`);
  return {
    startTimeLocal: normaliseTime(startRaw),
    endTimeLocal: normaliseTime(endRaw),
  };
}

export function parseLocalShiftDateTime(dateLocal: string, timeLocal: string, timezone = env.DEFAULT_TIMEZONE) {
  const time = normaliseTime(timeLocal);
  const local = `${dateLocal}T${time.slice(0, 2)}:${time.slice(2)}:00`;
  return fromZonedTime(local, timezone);
}

export function parseShiftBounds(dateLocal: string, startTime: string, endTime: string, timezone = env.DEFAULT_TIMEZONE) {
  const startTimeLocal = normaliseTime(startTime);
  const endTimeLocal = normaliseTime(endTime);
  const startAtUtc = parseLocalShiftDateTime(dateLocal, startTimeLocal, timezone);
  let endAtUtc = parseLocalShiftDateTime(dateLocal, endTimeLocal, timezone);
  if (endAtUtc <= startAtUtc) {
    endAtUtc = addMinutes(endAtUtc, 24 * 60);
  }
  return { startAtUtc, endAtUtc, startTimeLocal, endTimeLocal };
}

export function formatDisplayTime(value: Date, timezone = env.DEFAULT_TIMEZONE) {
  return format(toZonedTime(value, timezone), "HHmm", { timeZone: timezone });
}

export function formatDisplayDate(value: Date, timezone = env.DEFAULT_TIMEZONE) {
  return format(toZonedTime(value, timezone), "dd MMM yyyy", { timeZone: timezone });
}

export function formatDisplayDateTime(value: Date, timezone = env.DEFAULT_TIMEZONE) {
  return format(toZonedTime(value, timezone), "dd/MM/yyyy, HH:mm:ss", { timeZone: timezone });
}

export function minutesUntil(value: Date, now = new Date()) {
  return differenceInMinutes(value, now);
}

export function toDate(value: string | Date) {
  return typeof value === "string" ? parseISO(value) : value;
}
