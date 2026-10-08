-- CreateTable
CREATE TABLE "McpToken" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_hash_key" ON "McpToken"("hash");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The single token of Settings becomes its user's first personal token (it keeps working).
INSERT INTO "McpToken" ("name", "hash", "userId", "created_at")
SELECT 'Jeton MCP', "mcpTokenHash", "mcpTokenUserId", COALESCE("mcpTokenCreatedAt", CURRENT_TIMESTAMP)
FROM "Settings"
WHERE "mcpTokenHash" IS NOT NULL AND "mcpTokenUserId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Settings" DROP CONSTRAINT "Settings_mcpTokenUserId_fkey";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "mcpTokenCreatedAt",
DROP COLUMN "mcpTokenHash",
DROP COLUMN "mcpTokenUserId";
