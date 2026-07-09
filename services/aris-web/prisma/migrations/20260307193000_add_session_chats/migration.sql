-- CreateTable
CREATE TABLE "ProjectChat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "threadId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChat_sessionId_userId_isPinned_lastActivityAt_idx" ON "ProjectChat"("sessionId", "userId", "isPinned", "lastActivityAt");

-- CreateIndex
CREATE INDEX "ProjectChat_userId_updatedAt_idx" ON "ProjectChat"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ProjectChat" ADD CONSTRAINT "ProjectChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
