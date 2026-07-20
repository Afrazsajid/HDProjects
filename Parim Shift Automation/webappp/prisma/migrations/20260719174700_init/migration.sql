-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'STRING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "rawPhone" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "whatsappChatId" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "normalisedName" TEXT NOT NULL,
    "address" TEXT,
    "postcode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "shiftDateLocal" DATETIME NOT NULL,
    "startAtUtc" DATETIME NOT NULL,
    "endAtUtc" DATETIME NOT NULL,
    "startTimeLocal" TEXT NOT NULL,
    "endTimeLocal" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "checkedInAt" DATETIME,
    "checkedInSource" TEXT,
    "cancelledAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shift_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "systemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TriggerRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "anchor" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "recurrenceIntervalMinutes" INTEGER,
    "maximumOccurrences" INTEGER,
    "recurrenceStop" TEXT NOT NULL DEFAULT 'MANUAL',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "templateId" TEXT NOT NULL,
    "conditionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TriggerRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "locationId" TEXT,
    "triggerRuleId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "occurrenceNumber" INTEGER NOT NULL,
    "plannedIntervalMinutes" INTEGER,
    "dueAtUtc" DATETIME NOT NULL,
    "staggerOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "renderedText" TEXT,
    "openwaMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 3,
    "processingStartedAt" DATETIME,
    "claimedBy" TEXT,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancellationReason" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledMessage_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessage_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessage_triggerRuleId_fkey" FOREIGN KEY ("triggerRuleId") REFERENCES "TriggerRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledMessageId" TEXT,
    "shiftId" TEXT,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "whatsappChatId" TEXT NOT NULL,
    "openwaMessageId" TEXT,
    "text" TEXT,
    "payloadJson" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageEvent_scheduledMessageId_fkey" FOREIGN KEY ("scheduledMessageId") REFERENCES "ScheduledMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "estimatedArrival" TEXT,
    "issueType" TEXT,
    "notes" TEXT,
    "submittedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceResponse_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceResponse_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckInToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "filename" TEXT,
    "sheetId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkerLease" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "Worker_phoneE164_idx" ON "Worker"("phoneE164");

-- CreateIndex
CREATE INDEX "Worker_whatsappChatId_idx" ON "Worker"("whatsappChatId");

-- CreateIndex
CREATE INDEX "Worker_active_idx" ON "Worker"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Location_normalisedName_key" ON "Location"("normalisedName");

-- CreateIndex
CREATE INDEX "Location_normalisedName_idx" ON "Location"("normalisedName");

-- CreateIndex
CREATE INDEX "Location_active_idx" ON "Location"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_sourceFingerprint_key" ON "Shift"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "Shift_startAtUtc_idx" ON "Shift"("startAtUtc");

-- CreateIndex
CREATE INDEX "Shift_endAtUtc_idx" ON "Shift"("endAtUtc");

-- CreateIndex
CREATE INDEX "Shift_status_idx" ON "Shift"("status");

-- CreateIndex
CREATE INDEX "Shift_workerId_idx" ON "Shift"("workerId");

-- CreateIndex
CREATE INDEX "Shift_locationId_idx" ON "Shift"("locationId");

-- CreateIndex
CREATE INDEX "TriggerRule_enabled_idx" ON "TriggerRule"("enabled");

-- CreateIndex
CREATE INDEX "TriggerRule_anchor_idx" ON "TriggerRule"("anchor");

-- CreateIndex
CREATE INDEX "TriggerRule_priority_idx" ON "TriggerRule"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMessage_idempotencyKey_key" ON "ScheduledMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_dueAtUtc_idx" ON "ScheduledMessage"("status", "dueAtUtc");

-- CreateIndex
CREATE INDEX "ScheduledMessage_shiftId_idx" ON "ScheduledMessage"("shiftId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_workerId_idx" ON "ScheduledMessage"("workerId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_locationId_idx" ON "ScheduledMessage"("locationId");

-- CreateIndex
CREATE INDEX "MessageEvent_whatsappChatId_idx" ON "MessageEvent"("whatsappChatId");

-- CreateIndex
CREATE INDEX "MessageEvent_eventType_idx" ON "MessageEvent"("eventType");

-- CreateIndex
CREATE INDEX "MessageEvent_occurredAt_idx" ON "MessageEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceResponse_tokenHash_key" ON "AttendanceResponse"("tokenHash");

-- CreateIndex
CREATE INDEX "AttendanceResponse_shiftId_idx" ON "AttendanceResponse"("shiftId");

-- CreateIndex
CREATE INDEX "AttendanceResponse_workerId_idx" ON "AttendanceResponse"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInToken_tokenHash_key" ON "CheckInToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CheckInToken_shiftId_idx" ON "CheckInToken"("shiftId");

-- CreateIndex
CREATE INDEX "CheckInToken_workerId_idx" ON "CheckInToken"("workerId");

-- CreateIndex
CREATE INDEX "CheckInToken_expiresAt_idx" ON "CheckInToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ImportBatch_source_idx" ON "ImportBatch"("source");

-- CreateIndex
CREATE INDEX "ImportBatch_startedAt_idx" ON "ImportBatch"("startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
