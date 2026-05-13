CREATE TABLE "ProjectWorkspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Default workspace',
    "layoutJson" JSONB,
    "activePanelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectWorkspace_userId_projectId_title_key" ON "ProjectWorkspace"("userId", "projectId", "title");
CREATE INDEX "ProjectWorkspace_userId_projectId_updatedAt_idx" ON "ProjectWorkspace"("userId", "projectId", "updatedAt");

ALTER TABLE "ProjectWorkspace"
ADD CONSTRAINT "ProjectWorkspace_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
