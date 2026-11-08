-- AddColumn (backward compatible: new column has a default, old rows keep working)
ALTER TABLE "items" ADD COLUMN "sku" TEXT NOT NULL DEFAULT '';
