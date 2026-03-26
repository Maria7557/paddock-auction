/*
  Warnings:

  - A unique constraint covering the columns `[stripe_payment_intent_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AuctionState" ADD VALUE IF NOT EXISTS 'AWAITING_SELLER_DECISION';

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAID_PENDING_CONFIRMATION';

-- DropConstraint
ALTER TABLE "auctions" DROP CONSTRAINT IF EXISTS "auctions_vehicle_id_unique";

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN IF NOT EXISTS "decision_deadline_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "seller_decided_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "seller_decided_by" TEXT,
ADD COLUMN IF NOT EXISTS "seller_decision" TEXT;

-- AlterTable
ALTER TABLE "financial_events" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;

-- RecreateIndex
DROP INDEX IF EXISTS "payments_stripe_payment_intent_id_key";
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auctions_vehicle_id_fkey'
      AND conrelid = 'auctions'::regclass
  ) THEN
    ALTER TABLE "auctions"
      ADD CONSTRAINT "auctions_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
