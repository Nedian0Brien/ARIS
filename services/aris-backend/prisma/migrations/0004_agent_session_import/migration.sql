CREATE TABLE "ImportedAgentSession" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "projectPath" TEXT NOT NULL,
    "arisSessionId" TEXT,
    "chatId" TEXT,
    "tailCursorOffset" BIGINT,
    "oldestCursorOffset" BIGINT,
    "newestCursorOffset" BIGINT,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "fileMtimeMs" BIGINT NOT NULL DEFAULT 0,
    "importedTurnCount" INTEGER NOT NULL DEFAULT 0,
    "importedEventCount" INTEGER NOT NULL DEFAULT 0,
    "hasMoreBefore" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "errorMessage" TEXT,
    "lastScannedAt" TIMESTAMP(3),
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedAgentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportedAgentEvent" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "sourceEventKey" TEXT NOT NULL,
    "chatEventId" TEXT,
    "sourceOffset" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedAgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportedAgentSession_provider_sourcePath_key" ON "ImportedAgentSession"("provider", "sourcePath");
CREATE INDEX "ImportedAgentSession_provider_providerSessionId_idx" ON "ImportedAgentSession"("provider", "providerSessionId");
CREATE INDEX "ImportedAgentSession_status_lastScannedAt_idx" ON "ImportedAgentSession"("status", "lastScannedAt");
CREATE INDEX "ImportedAgentSession_chatId_idx" ON "ImportedAgentSession"("chatId");
CREATE UNIQUE INDEX "ImportedAgentEvent_importId_sourceEventKey_key" ON "ImportedAgentEvent"("importId", "sourceEventKey");
CREATE INDEX "ImportedAgentEvent_chatEventId_idx" ON "ImportedAgentEvent"("chatEventId");
