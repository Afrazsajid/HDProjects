import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { buildCheckInToken } from "../src/lib/check-in";
import { generateForShift } from "../src/lib/scheduler/generator";
import { parseLocalShiftDateTime } from "../src/lib/date-time";
import { normalisePhone } from "../src/lib/phone";

const defaultTemplates = [
  {
    name: "ETA reminder",
    content:
      "Hi {{firstName}}, your {{startTime}} shift at {{location}} starts in two hours. Please reply with your ETA. H&D Recruitment",
  },
  {
    name: "Policy reminder",
    content:
      "Hi {{firstName}}, your shift at {{location}} starts at {{startTime}}. Please follow the H&D hand-and-touch policy and remain contactable until you are on site.",
  },
  {
    name: "On-site confirmation",
    content:
      "Hi {{firstName}}, are you on site for your {{startTime}} shift at {{location}}? Reply YES or check in here: {{checkInUrl}}",
  },
  {
    name: "Attendance form reminder",
    content:
      "Hi {{firstName}}, please complete your shift check-in: {{checkInUrl}}",
  },
];

function conditionsForRule(name: string) {
  const base = {
    workerActive: true,
    whatsappOptIn: true,
    requirePhone: true,
  };
  if (name !== "Attendance form reminder") {
    return { ...base, reminderType: "STANDARD", reminderPattern: "FIXED" };
  }

  return {
    ...base,
    reminderType: "FORM_REMINDER",
    reminderPattern: "EVENLY_SPREAD",
    maxRemindersPerWorker: 12,
    minIntervalMinutes: 15,
    maxIntervalMinutes: 20,
    firstReminderDelayMinutes: 0,
    stopAtShiftEnd: true,
    stopAfterFormCompletion: false,
    staggerSameSite: true,
    minWorkerGapSeconds: 60,
    staggeringWindowMinutes: 10,
    customIntervalSequence: [],
  };
}

async function main() {
  await prisma.appSetting.upsert({
    where: { key: "timezone" },
    update: {},
    create: { key: "timezone", value: "Europe/London", valueType: "STRING" },
  });
  await prisma.appSetting.upsert({
    where: { key: "emergencyPauseSending" },
    update: {},
    create: { key: "emergencyPauseSending", value: "false", valueType: "BOOLEAN" },
  });

  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    const password = process.env.ADMIN_INITIAL_PASSWORD || randomBytes(9).toString("base64url");
    await prisma.adminUser.create({
      data: {
        email: process.env.ADMIN_EMAIL || "admin@handdservices.co.uk",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`Seeded initial admin. Initial password: ${password}`);
  }

  const templateByName = new Map<string, string>();
  for (const template of defaultTemplates) {
    const saved = await prisma.messageTemplate.upsert({
      where: { id: `seed-${template.name.toLowerCase().replaceAll(" ", "-")}` },
      update: { content: template.content },
      create: {
        id: `seed-${template.name.toLowerCase().replaceAll(" ", "-")}`,
        name: template.name,
        content: template.content,
        systemTemplate: true,
      },
    });
    templateByName.set(template.name, saved.id);
  }

  const rules = [
    ["ETA reminder", "SHIFT_START", -120, null, null, "MANUAL", 10],
    ["Policy reminder", "SHIFT_START", -15, null, null, "MANUAL", 20],
    ["On-site confirmation", "SHIFT_START", 0, null, null, "CHECKED_IN", 30],
    ["Attendance form reminder", "SHIFT_START", 0, null, 12, "SHIFT_END", 40],
  ] as const;

  for (const [name, anchor, offsetMinutes, recurrenceIntervalMinutes, maximumOccurrences, recurrenceStop, priority] of rules) {
    const conditionsJson = JSON.stringify(conditionsForRule(name));
    await prisma.triggerRule.upsert({
      where: { id: `seed-rule-${name.toLowerCase().replaceAll(" ", "-")}` },
      update: {
        anchor,
        offsetMinutes,
        recurrenceIntervalMinutes,
        maximumOccurrences,
        recurrenceStop,
        priority,
        templateId: templateByName.get(name)!,
        conditionsJson,
      },
      create: {
        id: `seed-rule-${name.toLowerCase().replaceAll(" ", "-")}`,
        name,
        enabled: false,
        anchor,
        offsetMinutes,
        recurrenceIntervalMinutes,
        maximumOccurrences,
        recurrenceStop,
        priority,
        templateId: templateByName.get(name)!,
        conditionsJson,
      },
    });
  }

  const phone = normalisePhone("07700900123");
  const worker = await prisma.worker.upsert({
    where: { id: "seed-worker-ava-khan" },
    update: {},
    create: {
      id: "seed-worker-ava-khan",
      firstName: "Ava",
      lastName: "Khan",
      fullName: "Ava Khan",
      rawPhone: "07700 900123",
      phoneE164: phone.e164,
      whatsappChatId: phone.chatId,
      department: "Security",
      position: "Door Supervisor",
    },
  });
  const location = await prisma.location.upsert({
    where: { id: "seed-location-heathrow" },
    update: {},
    create: {
      id: "seed-location-heathrow",
      name: "Heathrow Terminal 5",
      normalisedName: "heathrow terminal 5",
      postcode: "TW6",
    },
  });

  const start = parseLocalShiftDateTime("2026-07-20", "0645");
  const end = parseLocalShiftDateTime("2026-07-20", "1900");
  const shift = await prisma.shift.upsert({
    where: { sourceFingerprint: "seed:2026-07-20:+447700900123:0645:1900:heathrow terminal 5:door supervisor" },
    update: {},
    create: {
      source: "SEED",
      sourceFingerprint: "seed:2026-07-20:+447700900123:0645:1900:heathrow terminal 5:door supervisor",
      workerId: worker.id,
      locationId: location.id,
      shiftDateLocal: new Date("2026-07-20T00:00:00.000Z"),
      startAtUtc: start,
      endAtUtc: end,
      startTimeLocal: "0645",
      endTimeLocal: "1900",
      position: "Door Supervisor",
      department: "Security",
    },
  });

  await buildCheckInToken(shift.id, worker.id, end);
  await generateForShift(shift.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
