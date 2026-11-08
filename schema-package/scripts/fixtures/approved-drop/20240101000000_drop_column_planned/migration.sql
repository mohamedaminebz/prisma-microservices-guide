-- safety-check: approved
-- plan: shipped "title" on 2024-01-10 and dual-wrote both columns for two
--       weeks; every service now reads only "title".
-- rollback: re-add "name", backfill from "title", then re-point readers.
ALTER TABLE "items" DROP COLUMN "name";
