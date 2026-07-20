import { differenceInMinutes } from "date-fns";
import { formatDisplayDate } from "../date-time";
import { env } from "../env";

type RenderInput = {
  template: string;
  appBaseUrl?: string;
  shift: {
    id: string;
    startAtUtc: Date;
    endAtUtc: Date;
    startTimeLocal: string;
    endTimeLocal: string;
    position: string;
    department: string | null;
    worker: {
      firstName: string;
      lastName: string;
      fullName: string;
      phoneE164: string;
    };
    location: {
      name: string;
    };
  };
  checkInToken?: string | null;
  now?: Date;
};

export function renderTemplate(input: RenderInput) {
  const now = input.now ?? new Date();
  const checkInUrl = input.checkInToken
    ? `${input.appBaseUrl ?? env.APP_BASE_URL}/check-in/${input.checkInToken}`
    : `${input.appBaseUrl ?? env.APP_BASE_URL}/check-in`;
  const vars: Record<string, string> = {
    firstName: input.shift.worker.firstName,
    first_name: input.shift.worker.firstName,
    lastName: input.shift.worker.lastName,
    last_name: input.shift.worker.lastName,
    fullName: input.shift.worker.fullName,
    worker_name: input.shift.worker.fullName,
    phone: input.shift.worker.phoneE164,
    worker_phone: input.shift.worker.phoneE164,
    position: input.shift.position,
    worker_role: input.shift.position,
    department: input.shift.department ?? "",
    location: input.shift.location.name,
    location_name: input.shift.location.name,
    shiftDate: formatDisplayDate(input.shift.startAtUtc),
    shift_date: formatDisplayDate(input.shift.startAtUtc),
    startTime: input.shift.startTimeLocal,
    shift_start_time: input.shift.startTimeLocal,
    endTime: input.shift.endTimeLocal,
    shift_end_time: input.shift.endTimeLocal,
    shiftTime: `${input.shift.startTimeLocal} - ${input.shift.endTimeLocal}`,
    shift_time: `${input.shift.startTimeLocal} - ${input.shift.endTimeLocal}`,
    checkInUrl,
    check_in_url: checkInUrl,
    minutesUntilStart: String(Math.max(0, differenceInMinutes(input.shift.startAtUtc, now))),
    minutes_until_start: String(Math.max(0, differenceInMinutes(input.shift.startAtUtc, now))),
    minutesSinceStart: String(Math.max(0, differenceInMinutes(now, input.shift.startAtUtc))),
    minutes_since_start: String(Math.max(0, differenceInMinutes(now, input.shift.startAtUtc))),
  };
  return input.template.replace(/\{\{(\w+)}}/g, (_, key: string) => vars[key] ?? "");
}

export const sampleTemplateData = {
  firstName: "Ava",
  first_name: "Ava",
  lastName: "Khan",
  last_name: "Khan",
  fullName: "Ava Khan",
  worker_name: "Ava Khan",
  phone: "+447700900123",
  worker_phone: "+447700900123",
  position: "Door Supervisor",
  worker_role: "Door Supervisor",
  department: "Security",
  location: "Heathrow Terminal 5",
  location_name: "Heathrow Terminal 5",
  shiftDate: "20 Jul 2026",
  shift_date: "20 Jul 2026",
  startTime: "0645",
  shift_start_time: "0645",
  endTime: "1900",
  shift_end_time: "1900",
  shiftTime: "0645 - 1900",
  shift_time: "0645 - 1900",
  checkInUrl: `${env.APP_BASE_URL}/check-in/sample-token`,
  check_in_url: `${env.APP_BASE_URL}/check-in/sample-token`,
  minutesUntilStart: "120",
  minutes_until_start: "120",
  minutesSinceStart: "0",
  minutes_since_start: "0",
};

export function renderSample(template: string) {
  return template.replace(/\{\{(\w+)}}/g, (_, key: string) => sampleTemplateData[key as keyof typeof sampleTemplateData] ?? "");
}
