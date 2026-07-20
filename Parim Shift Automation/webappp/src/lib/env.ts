import { z } from "zod";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === "true");

const numberish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number(value ?? fallback);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const envSchema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_REQUIRED: booleanish.default(true),
  ADMIN_EMAIL: z.string().email().default("admin@handdservices.co.uk"),
  ADMIN_INITIAL_PASSWORD: z.string().optional().default(""),
  AUTH_SECRET: z.string().optional().default(""),
  IMPORT_API_SECRET: z.string().optional().default(""),
  OPENWA_BASE_URL: z.string().url().default("http://localhost:2785"),
  OPENWA_API_KEY: z.string().optional().default(""),
  OPENWA_SESSION_ID: z.string().default("hd-main"),
  OPENWA_WEBHOOK_SECRET: z.string().optional().default(""),
  OPENWA_REQUEST_TIMEOUT_MS: numberish(15000),
  OPENWA_MAX_MESSAGES_PER_MINUTE: numberish(20),
  OPENWA_MIN_DELAY_MS: numberish(1500),
  SCHEDULER_INTERVAL_MS: numberish(15000),
  SCHEDULER_LEASE_SECONDS: numberish(45),
  SCHEDULER_PROCESSING_TIMEOUT_MINUTES: numberish(10),
  SCHEDULER_OVERDUE_GRACE_MINUTES: numberish(20),
  SCHEDULER_MAX_ATTEMPTS: numberish(3),
  DEFAULT_TIMEZONE: z.string().default("Europe/London"),
  DEFAULT_COUNTRY: z.string().default("GB"),
  CHECK_IN_GRACE_MINUTES: numberish(120),
  SEND_ATTENDANCE_ACK: booleanish.default(true),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional().default(""),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().default(""),
  GOOGLE_PRIVATE_KEY: z.string().optional().default(""),
  GOOGLE_SHEET_ID: z.string().optional().default(""),
  GOOGLE_SHEET_TAB: z.string().default("Daily Shifts"),
  GOOGLE_SHEET_RANGE: z.string().default("Daily Shifts!A:H"),
});

export const env = envSchema.parse(process.env);
