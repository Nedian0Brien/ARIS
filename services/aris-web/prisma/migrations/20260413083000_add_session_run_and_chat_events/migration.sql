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

CREATE TABLE "SessionChatEvent" (
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

    CONSTRAINT "SessionChatEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionChatEvent_chatId_seq_key" ON "SessionChatEvent"("chatId", "seq");
CREATE INDEX "SessionRun_chatId_status_idx" ON "SessionRun"("chatId", "status");
CREATE INDEX "SessionRun_sessionId_chatId_startedAt_idx" ON "SessionRun"("sessionId", "chatId", "startedAt");
CREATE INDEX "SessionChatEvent_sessionId_chatId_seq_idx" ON "SessionChatEvent"("sessionId", "chatId", "seq");
CREATE INDEX "SessionChatEvent_chatId_createdAt_idx" ON "SessionChatEvent"("chatId", "createdAt");

ALTER TABLE "SessionRun"
ADD CONSTRAINT "SessionRun_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "SessionChat"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "SessionChatEvent"
ADD CONSTRAINT "SessionChatEvent_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "SessionChat"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "SessionChatEvent"
ADD CONSTRAINT "SessionChatEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "SessionRun"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
