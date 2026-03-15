-- Reconcile schema drift observed in production for admin pages.
-- This migration is additive and idempotent to safely run on partially-migrated databases.

-- Keep Company schema aligned with current Prisma model.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Ensure enum exists before creating vehicle_media table.
DO $$
BEGIN
  CREATE TYPE "VehicleMediaType" AS ENUM ('PHOTO', 'MULKIYA_FRONT', 'MULKIYA_BACK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reconcile Vehicle columns used by admin/seller/bid endpoints.
ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "market_price" DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS "fuelType" TEXT,
  ADD COLUMN IF NOT EXISTS "transmission" TEXT,
  ADD COLUMN IF NOT EXISTS "bodyType" TEXT,
  ADD COLUMN IF NOT EXISTS "regionSpec" TEXT,
  ADD COLUMN IF NOT EXISTS "condition" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceHistory" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "engine" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_type" TEXT,
  ADD COLUMN IF NOT EXISTS "exterior_color" TEXT,
  ADD COLUMN IF NOT EXISTS "interior_color" TEXT,
  ADD COLUMN IF NOT EXISTS "airbags" TEXT,
  ADD COLUMN IF NOT EXISTS "damage" TEXT,
  ADD COLUMN IF NOT EXISTS "damage_map" JSONB,
  ADD COLUMN IF NOT EXISTS "images" TEXT[];

ALTER TABLE "Vehicle"
  ALTER COLUMN "market_price" SET DEFAULT 700000.00,
  ALTER COLUMN "damage" SET DEFAULT 'None',
  ALTER COLUMN "images" SET DEFAULT ARRAY[]::TEXT[];

UPDATE "Vehicle"
SET
  "damage" = COALESCE("damage", 'None'),
  "images" = COALESCE("images", ARRAY[]::TEXT[]);

-- Reconcile auctions columns used by admin events and auction read models.
ALTER TABLE "auctions"
  ADD COLUMN IF NOT EXISTS "inspection_dropoff_date" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "viewing_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "auction_starts_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "auction_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "starting_price" DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS "buy_now_price" DECIMAL(18, 2);

UPDATE "auctions"
SET "starting_price" = COALESCE("starting_price", 0);

ALTER TABLE "auctions"
  ALTER COLUMN "starting_price" SET DEFAULT 0,
  ALTER COLUMN "starting_price" SET NOT NULL;

-- Reconcile media table introduced for vehicle images/documents.
CREATE TABLE IF NOT EXISTS "vehicle_media" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" "VehicleMediaType" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vehicle_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_media_vehicle_id_fkey" FOREIGN KEY ("vehicle_id")
    REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vehicle_media_vehicle_type_idx"
  ON "vehicle_media" ("vehicle_id", "type");

CREATE INDEX IF NOT EXISTS "vehicle_media_vehicle_sort_idx"
  ON "vehicle_media" ("vehicle_id", "sort_order");
