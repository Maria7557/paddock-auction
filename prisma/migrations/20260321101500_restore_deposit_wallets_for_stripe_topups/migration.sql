CREATE TABLE IF NOT EXISTS "deposit_wallets" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'AED',
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
