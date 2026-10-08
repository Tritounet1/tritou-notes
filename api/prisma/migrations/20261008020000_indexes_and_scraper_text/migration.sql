-- Scraper text fields become non-nullable: empty strings instead of NULL.
UPDATE "Scraper" SET "description" = '' WHERE "description" IS NULL;
UPDATE "Scraper" SET "code" = '' WHERE "code" IS NULL;

-- AlterTable
ALTER TABLE "Scraper" ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Document_authorId_idx" ON "Document"("authorId");

-- CreateIndex
CREATE INDEX "Document_lastEditorId_idx" ON "Document"("lastEditorId");

-- CreateIndex
CREATE INDEX "DocumentHistory_authorId_idx" ON "DocumentHistory"("authorId");

-- CreateIndex
CREATE INDEX "InstanceScrape_scrapingSchedulerId_idx" ON "InstanceScrape"("scrapingSchedulerId");

-- CreateIndex
CREATE INDEX "InstanceScrape_scraperId_idx" ON "InstanceScrape"("scraperId");

-- CreateIndex
CREATE INDEX "InstanceScrapeHistory_instanceScrapeId_created_at_idx" ON "InstanceScrapeHistory"("instanceScrapeId", "created_at");

-- CreateIndex
CREATE INDEX "InstanceScrapeHistory_scrapingSchedulerId_idx" ON "InstanceScrapeHistory"("scrapingSchedulerId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

