import { z } from "zod";

export const shiftStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "ACTIVE",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const scheduledMessageStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);

export const triggerRuleSchema = z.object({
  name: z.string().min(2),
  enabled: z.boolean().default(false),
  anchor: z.enum(["SHIFT_START", "SHIFT_END", "SHIFT_CREATED_OR_UPDATED", "WORKER_ASSIGNED", "CUSTOM_DATE_TIME"]),
  offsetMinutes: z.number().int(),
  recurrenceIntervalMinutes: z.number().int().positive().nullable().optional(),
  maximumOccurrences: z.number().int().positive().nullable().optional(),
  recurrenceStop: z.enum(["SHIFT_START", "SHIFT_END", "CHECKED_IN", "MAXIMUM_OCCURRENCES", "MANUAL"]),
  priority: z.number().int().default(100),
  templateId: z.string().min(1),
  conditionsJson: z.string().default("{}"),
});

export const normalisedShiftSchema = z.object({
  externalId: z.string().optional(),
  person: z.string().min(1),
  phone: z.string().min(5),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string(),
  endTime: z.string(),
  position: z.string().min(1),
  location: z.string().min(1),
  department: z.string().optional(),
  notes: z.string().optional(),
});

export const jsonImportSchema = z.object({
  shifts: z.array(normalisedShiftSchema).min(1),
  dryRun: z.boolean().optional().default(false),
});

export type NormalisedShiftInput = z.infer<typeof normalisedShiftSchema>;
