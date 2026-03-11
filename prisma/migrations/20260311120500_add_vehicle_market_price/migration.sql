ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "market_price" DECIMAL(18, 2);

UPDATE "Vehicle"
SET "market_price" = 700000.00;

ALTER TABLE "Vehicle"
  ALTER COLUMN "market_price" SET DEFAULT 700000.00;
