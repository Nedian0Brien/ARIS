ALTER TABLE "Workspace" RENAME TO "Project";
ALTER TABLE "Project" RENAME CONSTRAINT "Workspace_pkey" TO "Project_pkey";
ALTER TABLE "Project" RENAME CONSTRAINT "Workspace_userId_fkey" TO "Project_userId_fkey";
ALTER INDEX "Workspace_userId_path_key" RENAME TO "Project_userId_path_key";
ALTER INDEX "Workspace_userId_updatedAt_idx" RENAME TO "Project_userId_updatedAt_idx";

ALTER TABLE "ProjectWorkspace" RENAME TO "Workspace";
ALTER TABLE "Workspace" RENAME CONSTRAINT "ProjectWorkspace_pkey" TO "Workspace_pkey";
ALTER TABLE "Workspace" RENAME CONSTRAINT "ProjectWorkspace_userId_fkey" TO "Workspace_userId_fkey";
ALTER INDEX "ProjectWorkspace_userId_projectId_title_key" RENAME TO "Workspace_userId_projectId_title_key";
ALTER INDEX "ProjectWorkspace_userId_projectId_updatedAt_idx" RENAME TO "Workspace_userId_projectId_updatedAt_idx";

DELETE FROM "Workspace"
WHERE NOT EXISTS (
    SELECT 1 FROM "Project"
    WHERE "Project"."id" = "Workspace"."projectId"
);

ALTER TABLE "Workspace"
ADD CONSTRAINT "Workspace_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionChat" RENAME TO "Chat";
ALTER TABLE "Chat" RENAME COLUMN "sessionId" TO "projectId";
ALTER TABLE "Chat" RENAME CONSTRAINT "SessionChat_pkey" TO "Chat_pkey";
ALTER TABLE "Chat" RENAME CONSTRAINT "SessionChat_userId_fkey" TO "Chat_userId_fkey";
ALTER TABLE "Chat" RENAME CONSTRAINT "SessionChat_model_allowed_check" TO "Chat_model_allowed_check";
ALTER TABLE "Chat" RENAME CONSTRAINT "SessionChat_model_reasoning_effort_check" TO "Chat_model_reasoning_effort_check";
ALTER INDEX "SessionChat_sessionId_userId_isPinned_lastActivityAt_idx" RENAME TO "Chat_projectId_userId_isPinned_lastActivityAt_idx";
ALTER INDEX "SessionChat_userId_updatedAt_idx" RENAME TO "Chat_userId_updatedAt_idx";

CREATE TABLE "WorkspacePanel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "runtimeSessionId" TEXT,
    "branch" TEXT,
    "worktreePath" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspacePanel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspacePanel_workspaceId_panelId_key" ON "WorkspacePanel"("workspaceId", "panelId");
CREATE UNIQUE INDEX "WorkspacePanel_workspaceId_chatId_key" ON "WorkspacePanel"("workspaceId", "chatId");
CREATE INDEX "WorkspacePanel_chatId_idx" ON "WorkspacePanel"("chatId");
CREATE INDEX "WorkspacePanel_runtimeSessionId_idx" ON "WorkspacePanel"("runtimeSessionId");

ALTER TABLE "WorkspacePanel"
ADD CONSTRAINT "WorkspacePanel_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspacePanel"
ADD CONSTRAINT "WorkspacePanel_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
