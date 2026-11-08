-- DANGER: dropping a column while old services still read it will crash them.
ALTER TABLE "items" DROP COLUMN "sku";
