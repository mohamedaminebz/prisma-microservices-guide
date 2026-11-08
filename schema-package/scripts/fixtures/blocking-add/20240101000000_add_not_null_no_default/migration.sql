-- Looks safe but fails on a non-empty table: NOT NULL with no DEFAULT.
ALTER TABLE "items" ADD COLUMN "serial" TEXT NOT NULL;
