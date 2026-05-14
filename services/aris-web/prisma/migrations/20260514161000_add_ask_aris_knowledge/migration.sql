-- CreateEnum
CREATE TYPE "KnowledgeAssetKind" AS ENUM (
  'decision',
  'task_outcome',
  'command_recipe',
  'debug_case',
  'deployment_record',
  'project_memory',
  'user_preference',
  'external_note'
);

-- CreateEnum
CREATE TYPE "KnowledgeAssetStatus" AS ENUM ('candidate', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "KnowledgeAssetScope" AS ENUM ('global', 'project', 'chat');

-- CreateEnum
CREATE TYPE "KnowledgeSensitivity" AS ENUM ('normal', 'redacted', 'sensitive');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM (
  'session_chat_event',
  'session_run',
  'chat',
  'project',
  'external'
);

-- CreateEnum
CREATE TYPE "AskMessageRole" AS ENUM ('user', 'assistant', 'system');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "includeInAskIndex" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "includeInAskIndex" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "KnowledgeAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "KnowledgeAssetKind" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "KnowledgeAssetStatus" NOT NULL DEFAULT 'candidate',
  "scope" "KnowledgeAssetScope" NOT NULL DEFAULT 'chat',
  "projectId" TEXT,
  "chatId" TEXT,
  "runId" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'normal',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSourceRef" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sourceType" "KnowledgeSourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "projectId" TEXT,
  "chatId" TEXT,
  "runId" TEXT,
  "eventSeq" INTEGER,
  "label" TEXT,
  "snippet" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeSourceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskThread" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Ask ARIS',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AskThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "AskMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "sources" JSONB,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeAsset_dedupeKey_key" ON "KnowledgeAsset"("dedupeKey");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_userId_status_kind_updatedAt_idx" ON "KnowledgeAsset"("userId", "status", "kind", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_userId_projectId_updatedAt_idx" ON "KnowledgeAsset"("userId", "projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_chatId_idx" ON "KnowledgeAsset"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSourceRef_assetId_sourceType_sourceId_key" ON "KnowledgeSourceRef"("assetId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeSourceRef_sourceType_sourceId_idx" ON "KnowledgeSourceRef"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeSourceRef_chatId_eventSeq_idx" ON "KnowledgeSourceRef"("chatId", "eventSeq");

-- CreateIndex
CREATE INDEX "AskThread_userId_updatedAt_idx" ON "AskThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AskMessage_threadId_createdAt_idx" ON "AskMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "KnowledgeAsset" ADD CONSTRAINT "KnowledgeAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSourceRef" ADD CONSTRAINT "KnowledgeSourceRef_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "KnowledgeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThread" ADD CONSTRAINT "AskThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskMessage" ADD CONSTRAINT "AskMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AskThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
