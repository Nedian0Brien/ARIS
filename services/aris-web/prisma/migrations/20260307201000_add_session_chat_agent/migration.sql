-- Add per-chat agent selection support.
ALTER TABLE "SessionChat"
ADD COLUMN "agent" TEXT NOT NULL DEFAULT 'codex';
