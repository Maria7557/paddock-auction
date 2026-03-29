ALTER TABLE "Vehicle"
  DROP COLUMN "market_price",
  DROP COLUMN "condition";

ALTER TABLE "Vehicle"
  ALTER COLUMN "damage" DROP DEFAULT;

UPDATE "Vehicle"
SET "damage" = NULL
WHERE "damage" = 'None';
