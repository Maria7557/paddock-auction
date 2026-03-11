-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "VehicleMediaType" AS ENUM ('PHOTO', 'MULKIYA_FRONT', 'MULKIYA_BACK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Vehicle
ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "damage_map" JSONB;

ALTER TABLE "Vehicle"
  DROP COLUMN IF EXISTS "sellerNotes";

-- AlterTable auctions
ALTER TABLE "auctions"
  ADD COLUMN IF NOT EXISTS "inspection_dropoff_date" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "viewing_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "auction_starts_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "auction_ends_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicle_media" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" "VehicleMediaType" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vehicle_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_media_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "vehicle_media_vehicle_type_idx" ON "vehicle_media" ("vehicle_id", "type");
CREATE INDEX IF NOT EXISTS "vehicle_media_vehicle_sort_idx" ON "vehicle_media" ("vehicle_id", "sort_order");
