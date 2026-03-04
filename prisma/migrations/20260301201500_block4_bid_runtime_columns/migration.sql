-- AlterTable
ALTER TABLE "auctions"
  ADD COLUMN IF NOT EXISTS "current_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "min_increment" DECIMAL(18,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "last_bid_sequence" INTEGER NOT NULL DEFAULT 0;

-- AddConstraint
ALTER TABLE "auctions"
  ADD CONSTRAINT "auctions_current_price_non_negative_check" CHECK ("current_price" >= 0);

-- AddConstraint
ALTER TABLE "auctions"
  ADD CONSTRAINT "auctions_min_increment_positive_check" CHECK ("min_increment" > 0);

-- AddConstraint
ALTER TABLE "auctions"
  ADD CONSTRAINT "auctions_last_bid_sequence_non_negative_check" CHECK ("last_bid_sequence" >= 0);
