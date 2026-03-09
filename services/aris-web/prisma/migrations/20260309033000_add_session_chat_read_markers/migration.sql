ALTER TABLE "SessionChat"
ADD COLUMN "lastReadAt" TIMESTAMP(3),
ADD COLUMN "lastReadEventId" TEXT;
