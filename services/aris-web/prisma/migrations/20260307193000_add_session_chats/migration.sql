-- CreateTable
CREATE TABLE "SessionChat" (
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

    CONSTRAINT "SessionChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionChat_sessionId_userId_isPinned_lastActivityAt_idx" ON "SessionChat"("sessionId", "userId", "isPinned", "lastActivityAt");

-- CreateIndex
CREATE INDEX "SessionChat_userId_updatedAt_idx" ON "SessionChat"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "SessionChat" ADD CONSTRAINT "SessionChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
