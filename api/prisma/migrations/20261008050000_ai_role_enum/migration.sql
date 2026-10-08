-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('user', 'assistant', 'tool');

-- AlterTable: converts the stored values in place (only these three roles are ever stored).
ALTER TABLE "AiMessage" ALTER COLUMN "role" TYPE "AiRole" USING ("role"::"AiRole");
