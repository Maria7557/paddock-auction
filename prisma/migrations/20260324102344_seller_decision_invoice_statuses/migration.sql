/*
  Warnings:

  - A unique constraint covering the columns `[stripe_payment_intent_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AuctionState" ADD VALUE 'AWAITING_SELLER_DECISION';

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PAID_PENDING_CONFIRMATION';

-- Drop legacy unique vehicle constraint before adding the foreign key.
ALTER TABLE "auctions" DROP CONSTRAINT IF EXISTS "auctions_vehicle_id_unique";
DROP INDEX IF EXISTS "auctions_vehicle_id_unique";

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "decision_deadline_at" TIMESTAMPTZ(6),
ADD COLUMN     "seller_decided_at" TIMESTAMPTZ(6),
ADD COLUMN     "seller_decided_by" TEXT,
ADD COLUMN     "seller_decision" TEXT;

-- AlterTable
ALTER TABLE "financial_events" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;

-- CreateIndex
DROP INDEX IF EXISTS "payments_stripe_payment_intent_id_key";
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
