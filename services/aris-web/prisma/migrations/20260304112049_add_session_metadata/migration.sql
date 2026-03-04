-- CreateTable
CREATE TABLE "SessionMetadata" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionMetadata_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "SessionMetadata_userId_idx" ON "SessionMetadata"("userId");

-- AddForeignKey
ALTER TABLE "SessionMetadata" ADD CONSTRAINT "SessionMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
