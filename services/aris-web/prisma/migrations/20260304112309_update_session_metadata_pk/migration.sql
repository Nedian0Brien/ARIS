/*
  Warnings:

  - The primary key for the `SessionMetadata` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "SessionMetadata" DROP CONSTRAINT "SessionMetadata_pkey",
ADD CONSTRAINT "SessionMetadata_pkey" PRIMARY KEY ("sessionId", "userId");
