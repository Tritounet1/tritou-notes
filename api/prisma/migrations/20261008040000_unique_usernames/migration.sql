-- Usernames become unique: later duplicates get their id appended first (e.g. "alex-12").
UPDATE "User" AS u SET "username" = u."username" || '-' || u."id"
WHERE EXISTS (SELECT 1 FROM "User" AS o WHERE o."username" = u."username" AND o."id" < u."id");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

