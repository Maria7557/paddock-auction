/*
  Warnings:

  - You are about to drop the column `company_id` on the `deposit_locks` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `deposit_locks` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Integer`.
  - You are about to drop the `auction_state_transitions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `auctions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `bid_requests` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `bids` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `deposit_wallets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `financial_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payment_deadlines` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payment_webhook_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `wallet_id` on table `deposit_locks` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "IdempotencyKeyStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- DropForeignKey
ALTER TABLE "auction_state_transitions" DROP CONSTRAINT "auction_state_transitions_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "bid_requests" DROP CONSTRAINT "bid_requests_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "bid_requests" DROP CONSTRAINT "bid_requests_bid_id_fkey";

-- DropForeignKey
ALTER TABLE "bids" DROP CONSTRAINT "bids_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "deposit_locks" DROP CONSTRAINT "deposit_locks_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "deposit_locks" DROP CONSTRAINT "deposit_locks_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "financial_events" DROP CONSTRAINT "financial_events_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "financial_events" DROP CONSTRAINT "financial_events_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_deadlines" DROP CONSTRAINT "payment_deadlines_auction_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";

-- DropIndex
DROP INDEX "deposit_locks_lookup_idx";

-- DropIndex
DROP INDEX "deposit_locks_wallet_lookup_idx";

-- AlterTable
ALTER TABLE "WalletLedger" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "deposit_locks" DROP COLUMN "company_id",
ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "released_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "burned_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "wallet_id" SET NOT NULL;

-- DropTable
DROP TABLE "auction_state_transitions";

-- DropTable
DROP TABLE "auctions";

-- DropTable
DROP TABLE "bid_requests";

-- DropTable
DROP TABLE "bids";

-- DropTable
DROP TABLE "deposit_wallets";

-- DropTable
DROP TABLE "financial_events";

-- DropTable
DROP TABLE "invoices";

-- DropTable
DROP TABLE "payment_deadlines";

-- DropTable
DROP TABLE "payment_webhook_events";

-- DropTable
DROP TABLE "payments";

-- DropEnum
DROP TYPE "AuctionState";

-- DropEnum
DROP TYPE "BidRequestStatus";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "PaymentDeadlineStatus";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "PaymentWebhookEventStatus";

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "IdempotencyKeyStatus" NOT NULL DEFAULT 'PENDING',
    "response_status" INTEGER,
    "response_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "partition_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "idempotency_key" TEXT,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_checkpoints" (
    "id" TEXT NOT NULL,
    "consumer_name" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_actor_id_endpoint_idempotency_key_key" ON "idempotency_keys"("actor_id", "endpoint", "idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_id_idx" ON "outbox_events"("status", "next_attempt_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_checkpoints_consumer_name_event_id_key" ON "consumer_checkpoints"("consumer_name", "event_id");

-- AddForeignKey
ALTER TABLE "deposit_locks" ADD CONSTRAINT "deposit_locks_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
