-- AlterTable
ALTER TABLE "deposit_locks"
  ADD COLUMN "buying_power_ceiling" DECIMAL(18,2),
  ALTER COLUMN "auction_id" DROP NOT NULL;

UPDATE "deposit_locks"
SET "buying_power_ceiling" = ("amount" / 5000.00) * 300000.00
WHERE "buying_power_ceiling" IS NULL;

ALTER TABLE "deposit_locks"
  ALTER COLUMN "buying_power_ceiling" SET NOT NULL;

-- AlterTable
ALTER TABLE "financial_events" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "buyer_bid_summaries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "active_bids_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buyer_bid_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buyer_bid_summaries_company_id_key" ON "buyer_bid_summaries"("company_id");

-- Enforce Phase 1 buying power invariants that Prisma cannot express directly.
ALTER TABLE "buyer_bid_summaries"
  ADD CONSTRAINT "active_bids_non_negative" CHECK ("active_bids_total" >= 0);

DROP INDEX IF EXISTS "deposit_locks_active_lock_unique";
DROP INDEX IF EXISTS "deposit_locks_active_wallet_unique";

CREATE UNIQUE INDEX "deposit_locks_one_active_per_company"
  ON "deposit_locks"("company_id")
  WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "buyer_bid_summaries" ADD CONSTRAINT "buyer_bid_summaries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_locks" ADD CONSTRAINT "deposit_locks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
