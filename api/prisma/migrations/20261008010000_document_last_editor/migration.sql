-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lastEditorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_lastEditorId_fkey" FOREIGN KEY ("lastEditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Until now authorId was rewritten on every edit: it holds the last editor.
UPDATE "Document" SET "lastEditorId" = "authorId";
