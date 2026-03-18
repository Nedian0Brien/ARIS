CREATE TABLE IF NOT EXISTS "Session" (
  "id"             TEXT NOT NULL,
  "flavor"         TEXT NOT NULL,
  "path"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'idle',
  "approvalPolicy" TEXT NOT NULL DEFAULT 'on-request',
  "model"          TEXT,
  "riskScore"      INTEGER NOT NULL DEFAULT 20,
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionMessage" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT,
  "text"      TEXT NOT NULL,
  "meta"      JSONB,
  "seq"       INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SessionMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionMessage_sessionId_seq_key" UNIQUE ("sessionId", "seq"),
  CONSTRAINT "SessionMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SessionMessage_sessionId_seq_idx"  ON "SessionMessage" ("sessionId", "seq");
CREATE INDEX IF NOT EXISTS "SessionMessage_sessionId_time_idx" ON "SessionMessage" ("sessionId", "createdAt");

CREATE TABLE IF NOT EXISTS "Permission" (
  "id"          TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "chatId"      TEXT,
  "agent"       TEXT NOT NULL,
  "command"     TEXT NOT NULL,
  "reason"      TEXT NOT NULL,
  "risk"        TEXT NOT NULL,
  "state"       TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "decidedAt"   TIMESTAMPTZ,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Permission_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Permission_sessionId_idx" ON "Permission" ("sessionId");
CREATE INDEX IF NOT EXISTS "Permission_state_idx"     ON "Permission" ("state");
