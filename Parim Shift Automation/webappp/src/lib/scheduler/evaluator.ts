import { isAfter, isBefore } from "date-fns";
import { safeJson } from "../utils";
import { getShiftDisplayStatus } from "../shifts/status";

type RuleConditions = {
  includeLocations?: string[];
  excludeLocations?: string[];
  includePositions?: string[];
  excludePositions?: string[];
  includeDepartments?: string[];
  excludeDepartments?: string[];
  weekdays?: number[];
  shiftStatuses?: string[];
  workerActive?: boolean;
  whatsappOptIn?: boolean;
  requirePhone?: boolean;
  startTimeRange?: { from: string; to: string };
  endTimeRange?: { from: string; to: string };
  dateRange?: { from?: string; to?: string };
};

type EvaluatedShift = {
  status: string;
  startTimeLocal: string;
  endTimeLocal: string;
  shiftDateLocal: Date;
  startAtUtc: Date;
  endAtUtc: Date;
  checkedInAt?: Date | null;
  cancelledAt?: Date | null;
  position: string;
  department: string | null;
  location: { normalisedName: string; name: string };
  worker: { active: boolean; whatsappOptIn: boolean; phoneE164: string | null };
};

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function inOvernightRange(value: string, from: string, to: string) {
  const v = Number(value);
  const start = Number(from);
  const end = Number(to);
  if (Number.isNaN(v) || Number.isNaN(start) || Number.isNaN(end)) return false;
  if (start <= end) return v >= start && v <= end;
  return v >= start || v <= end;
}

function includesAny(target: string | null | undefined, values?: string[]) {
  if (!values?.length) return true;
  return values.map(norm).includes(norm(target));
}

function excludesAny(target: string | null | undefined, values?: string[]) {
  if (!values?.length) return true;
  return !values.map(norm).includes(norm(target));
}

export function ruleMatchesShift(conditionsJson: string, shift: EvaluatedShift) {
  const conditions = safeJson<RuleConditions>(conditionsJson, {});
  if (conditions.workerActive !== undefined && shift.worker.active !== conditions.workerActive) return false;
  if (conditions.whatsappOptIn !== undefined && shift.worker.whatsappOptIn !== conditions.whatsappOptIn) return false;
  if (conditions.requirePhone && !shift.worker.phoneE164) return false;
  if (conditions.shiftStatuses?.length && !conditions.shiftStatuses.includes(shift.status) && !conditions.shiftStatuses.includes(getShiftDisplayStatus(shift))) return false;
  if (!includesAny(shift.location.normalisedName, conditions.includeLocations)) return false;
  if (!excludesAny(shift.location.normalisedName, conditions.excludeLocations)) return false;
  if (!includesAny(shift.position, conditions.includePositions)) return false;
  if (!excludesAny(shift.position, conditions.excludePositions)) return false;
  if (!includesAny(shift.department, conditions.includeDepartments)) return false;
  if (!excludesAny(shift.department, conditions.excludeDepartments)) return false;

  const weekday = shift.shiftDateLocal.getUTCDay();
  if (conditions.weekdays?.length && !conditions.weekdays.includes(weekday)) return false;

  if (conditions.startTimeRange && !inOvernightRange(shift.startTimeLocal, conditions.startTimeRange.from, conditions.startTimeRange.to)) {
    return false;
  }
  if (conditions.endTimeRange && !inOvernightRange(shift.endTimeLocal, conditions.endTimeRange.from, conditions.endTimeRange.to)) {
    return false;
  }

  if (conditions.dateRange?.from && isBefore(shift.shiftDateLocal, new Date(`${conditions.dateRange.from}T00:00:00.000Z`))) return false;
  if (conditions.dateRange?.to && isAfter(shift.shiftDateLocal, new Date(`${conditions.dateRange.to}T23:59:59.999Z`))) return false;
  return true;
}
