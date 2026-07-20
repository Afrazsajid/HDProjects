import { parseShiftTimeRange } from "../date-time";
import type { NormalisedShiftInput } from "../validation";

type SheetRow = string[];

function looksLikeDate(value: string) {
  return /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+\w+\s+\d{1,2},?\s+\d{4}\b/i.test(value)
    || /\b\d{1,2}\s+\w+\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(value);
}

function toIsoDate(value: string) {
  const iso = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const cleaned = value
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+/i, "")
    .replace(/,/g, "")
    .trim();
  const monthLookup: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const longDate = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (longDate) {
    const month = monthLookup[longDate[1].toLowerCase()];
    if (month) return `${longDate[3]}-${month}-${longDate[2].padStart(2, "0")}`;
  }
  const dayFirst = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayFirst) {
    const month = monthLookup[dayFirst[2].toLowerCase()];
    if (month) return `${dayFirst[3]}-${month}-${dayFirst[1].padStart(2, "0")}`;
  }
  throw new Error(`Could not parse date row: ${value}`);
}

export function parseDailySectionRows(rows: SheetRow[]) {
  const shifts: NormalisedShiftInput[] = [];
  let currentDate: string | null = null;
  let header: string[] | null = null;

  for (const row of rows) {
    const cells = row.map((cell) => String(cell ?? "").trim());
    if (cells.every((cell) => !cell)) continue;
    if (looksLikeDate(cells.join(" "))) {
      currentDate = toIsoDate(cells.join(" "));
      header = null;
      continue;
    }
    const lower = cells.map((cell) => cell.toLowerCase());
    if (lower.includes("person") && lower.some((cell) => cell.includes("shift"))) {
      header = lower;
      continue;
    }
    if (!currentDate || !header) continue;

    const at = (...names: string[]) => {
      const index = header!.findIndex((column) => names.some((name) => column === name || column.includes(name)));
      return index >= 0 ? cells[index] ?? "" : "";
    };
    const person = at("person");
    const phone = at("phone");
    const shiftTime = at("shift time", "time");
    if (!person || !phone || !shiftTime) continue;
    const { startTimeLocal, endTimeLocal } = parseShiftTimeRange(shiftTime);
    shifts.push({
      person,
      phone,
      date: currentDate,
      startTime: startTimeLocal,
      endTime: endTimeLocal,
      position: at("position", "role") || "Worker",
      location: at("location", "venue") || "Unknown",
      notes: at("notes", "arrival / status"),
    });
  }
  return shifts;
}
