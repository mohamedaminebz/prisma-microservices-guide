-- DANGER: renaming a column is a drop of the old name + add of a new one.
ALTER TABLE "items" RENAME COLUMN "name" TO "title";
