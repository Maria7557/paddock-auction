-- CreateEnum
CREATE TYPE "AuctionState" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'EXTENDED',
  'CLOSED',
  'PAYMENT_PENDING',
  'PAID',
  'DEFAULTED',
  'CANCELED',
  'RELISTED'
);

-- CreateEnum
CREATE TYPE "DepositLockStatus" AS ENUM ('ACTIVE', 'RELEASED', 'BURNED');

-- CreateEnum
CREATE TYPE "BidRequestStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'DEFAULTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentDeadlineStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DEFAULTED');

-- CreateTable
CREATE TABLE "auctions" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "seller_company_id" TEXT NOT NULL,
  "state" "AuctionState" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "extension_count" INTEGER NOT NULL DEFAULT 0,
  "highest_bid_id" TEXT,
  "winner_company_id" TEXT,
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auctions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auctions_version_non_negative_check" CHECK ("version" >= 0),
  CONSTRAINT "auctions_extension_count_non_negative_check" CHECK ("extension_count" >= 0),
  CONSTRAINT "auctions_time_window_check" CHECK ("starts_at" < "ends_at")
);

-- CreateTable
CREATE TABLE "auction_state_transitions" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "from_state" "AuctionState" NOT NULL,
  "to_state" "AuctionState" NOT NULL,
  "trigger" TEXT NOT NULL,
  "reason" TEXT,
  "actor_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auction_state_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auction_state_transitions_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deposit_wallets" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "available_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "locked_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "pending_withdrawal_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deposit_wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deposit_wallets_available_balance_non_negative_check" CHECK ("available_balance" >= 0),
  CONSTRAINT "deposit_wallets_locked_balance_non_negative_check" CHECK ("locked_balance" >= 0),
  CONSTRAINT "deposit_wallets_pending_withdrawal_balance_non_negative_check" CHECK ("pending_withdrawal_balance" >= 0),
  CONSTRAINT "deposit_wallets_company_currency_key" UNIQUE ("company_id", "currency")
);

-- CreateTable
CREATE TABLE "deposit_locks" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "status" "DepositLockStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ(6),
  "burned_at" TIMESTAMPTZ(6),
  "resolution_reason" TEXT,

  CONSTRAINT "deposit_locks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deposit_locks_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deposit_locks_amount_positive_check" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "bids" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "sequence_no" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bids_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bids_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "bids_sequence_no_positive_check" CHECK ("sequence_no" > 0)
);

-- CreateTable
CREATE TABLE "bid_requests" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" "BidRequestStatus" NOT NULL,
  "response_status" INTEGER,
  "response_body" JSONB,
  "bid_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "bid_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bid_requests_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bid_requests_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "bid_requests_expires_after_created_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "bid_requests_auction_company_idempotency_key" UNIQUE ("auction_id", "company_id", "idempotency_key")
);

-- CreateTable
CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "buyer_company_id" TEXT NOT NULL,
  "seller_company_id" TEXT NOT NULL,
  "subtotal" DECIMAL(18,2) NOT NULL,
  "commission" DECIMAL(18,2) NOT NULL,
  "vat" DECIMAL(18,2) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoices_auction_id_key" UNIQUE ("auction_id"),
  CONSTRAINT "invoices_subtotal_non_negative_check" CHECK ("subtotal" >= 0),
  CONSTRAINT "invoices_commission_non_negative_check" CHECK ("commission" >= 0),
  CONSTRAINT "invoices_vat_non_negative_check" CHECK ("vat" >= 0),
  CONSTRAINT "invoices_total_non_negative_check" CHECK ("total" >= 0),
  CONSTRAINT "invoices_total_consistency_check" CHECK ("total" = ("subtotal" + "commission" + "vat"))
);

-- CreateTable
CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT,
  "stripe_payment_intent_id" TEXT,
  "stripe_charge_id" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "failure_reason_code" TEXT,
  "last_event_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_amount_non_negative_check" CHECK ("amount" >= 0)
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "stripe_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_webhook_events_stripe_event_id_key" UNIQUE ("stripe_event_id")
);

-- CreateTable
CREATE TABLE "payment_deadlines" (
  "id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "buyer_company_id" TEXT NOT NULL,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "PaymentDeadlineStatus" NOT NULL DEFAULT 'ACTIVE',
  "escalated_flag" BOOLEAN NOT NULL DEFAULT false,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_deadlines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_deadlines_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_events" (
  "id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "auction_id" TEXT,
  "company_id" TEXT,
  "invoice_id" TEXT,
  "payment_id" TEXT,
  "amount" DECIMAL(18,2),
  "currency" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_events_source_type_source_id_key" UNIQUE ("source_type", "source_id"),
  CONSTRAINT "financial_events_amount_non_negative_check" CHECK ("amount" IS NULL OR "amount" >= 0)
);

-- CreateIndex
CREATE INDEX "auctions_state_ends_at_idx" ON "auctions" ("state", "ends_at");

-- CreateIndex
CREATE INDEX "auction_state_transitions_auction_created_at_idx" ON "auction_state_transitions" ("auction_id", "created_at");

-- CreateIndex
CREATE INDEX "deposit_locks_lookup_idx" ON "deposit_locks" ("auction_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_locks_active_lock_unique" ON "deposit_locks" ("auction_id", "company_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "bids_auction_sequence_no_key" ON "bids" ("auction_id", "sequence_no");

-- CreateIndex
CREATE INDEX "bids_auction_created_at_idx" ON "bids" ("auction_id", "created_at");

-- CreateIndex
CREATE INDEX "bid_requests_expires_at_idx" ON "bid_requests" ("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments" ("stripe_payment_intent_id") WHERE "stripe_payment_intent_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "payments_invoice_status_idx" ON "payments" ("invoice_id", "status");

-- CreateIndex
CREATE INDEX "payment_deadlines_lookup_idx" ON "payment_deadlines" ("auction_id", "buyer_company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_deadlines_active_unique" ON "payment_deadlines" ("auction_id", "buyer_company_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "financial_events_auction_created_at_idx" ON "financial_events" ("auction_id", "created_at");

-- CreateFunction
CREATE OR REPLACE FUNCTION "enforce_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only. % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END;
$$;

-- CreateTrigger
CREATE TRIGGER "auction_state_transitions_append_only_trigger"
BEFORE UPDATE OR DELETE ON "auction_state_transitions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_append_only"();

-- CreateTrigger
CREATE TRIGGER "bids_append_only_trigger"
BEFORE UPDATE OR DELETE ON "bids"
FOR EACH ROW
EXECUTE FUNCTION "enforce_append_only"();

-- CreateTrigger
CREATE TRIGGER "payment_webhook_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "payment_webhook_events"
FOR EACH ROW
EXECUTE FUNCTION "enforce_append_only"();

-- CreateTrigger
CREATE TRIGGER "financial_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "financial_events"
FOR EACH ROW
EXECUTE FUNCTION "enforce_append_only"();
