-- Subagent linkage + status for imported agent sessions.
-- parentChatId: when set, this Chat is a subagent transcript belonging to another chat
--   and MUST be excluded from the main chat list (surfaced only in the subagent sidebar).
-- subagentType/subagentStatus: metadata shown in the subagent sidebar.
ALTER TABLE "Chat"
ADD COLUMN "parentChatId" TEXT,
ADD COLUMN "subagentType" TEXT,
ADD COLUMN "subagentStatus" TEXT;

CREATE INDEX "Chat_parentChatId_idx" ON "Chat"("parentChatId");
