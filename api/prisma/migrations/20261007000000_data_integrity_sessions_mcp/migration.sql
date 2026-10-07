-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_authorId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_authorId_fkey";

-- DropForeignKey
ALTER TABLE "InstanceScrapeHistory" DROP CONSTRAINT "InstanceScrapeHistory_instanceScrapeId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_authorId_fkey";

-- DropForeignKey
ALTER TABLE "UserPermissions" DROP CONSTRAINT "UserPermissions_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentHistory" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "mcpTokenUserId" INTEGER;

-- CreateIndex
CREATE INDEX "DocumentHistory_documentId_created_at_idx" ON "DocumentHistory"("documentId", "created_at");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceScrapeHistory" ADD CONSTRAINT "InstanceScrapeHistory_instanceScrapeId_fkey" FOREIGN KEY ("instanceScrapeId") REFERENCES "InstanceScrape"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissions" ADD CONSTRAINT "UserPermissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_mcpTokenUserId_fkey" FOREIGN KEY ("mcpTokenUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

