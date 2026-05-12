CREATE TABLE "ParallelWorkspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "panelLayoutJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParallelWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParallelWorkspace_userId_updatedAt_idx" ON "ParallelWorkspace"("userId", "updatedAt");

CREATE INDEX "ParallelWorkspace_userId_rootPath_idx" ON "ParallelWorkspace"("userId", "rootPath");

ALTER TABLE "ParallelWorkspace" ADD CONSTRAINT "ParallelWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
