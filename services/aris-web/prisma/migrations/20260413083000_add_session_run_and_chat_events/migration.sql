CREATE TABLE "SessionRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectChatEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "runId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "meta" JSONB,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChatEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectChatEvent_chatId_seq_key" ON "ProjectChatEvent"("chatId", "seq");
CREATE INDEX "SessionRun_chatId_status_idx" ON "SessionRun"("chatId", "status");
CREATE INDEX "SessionRun_sessionId_chatId_startedAt_idx" ON "SessionRun"("sessionId", "chatId", "startedAt");
CREATE INDEX "ProjectChatEvent_sessionId_chatId_seq_idx" ON "ProjectChatEvent"("sessionId", "chatId", "seq");
CREATE INDEX "ProjectChatEvent_chatId_createdAt_idx" ON "ProjectChatEvent"("chatId", "createdAt");

ALTER TABLE "SessionRun"
ADD CONSTRAINT "SessionRun_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "ProjectChat"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ProjectChatEvent"
ADD CONSTRAINT "ProjectChatEvent_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "ProjectChat"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ProjectChatEvent"
ADD CONSTRAINT "ProjectChatEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "SessionRun"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
