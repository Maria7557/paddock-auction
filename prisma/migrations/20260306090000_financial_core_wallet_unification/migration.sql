-- Wallet invariants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Wallet_balance_non_negative_check'
  ) THEN
    ALTER TABLE "Wallet"
      ADD CONSTRAINT "Wallet_balance_non_negative_check"
      CHECK (balance >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Wallet_lockedBalance_non_negative_check'
  ) THEN
    ALTER TABLE "Wallet"
      ADD CONSTRAINT "Wallet_lockedBalance_non_negative_check"
      CHECK ("lockedBalance" >= 0);
  END IF;
END
$$;

-- Wallet ledger performance
CREATE INDEX IF NOT EXISTS "walletledger_wallet_idx"
  ON "WalletLedger" ("walletId");

-- Deposit locks now link directly to Wallet
ALTER TABLE deposit_locks
  ADD COLUMN IF NOT EXISTS wallet_id TEXT;

UPDATE deposit_locks AS dl
SET wallet_id = w.id
FROM "Wallet" AS w
WHERE dl.wallet_id IS NULL
  AND w."userId" = dl.company_id;

UPDATE deposit_locks AS dl
SET wallet_id = mapped.wallet_id
FROM (
  SELECT DISTINCT ON (auction_id, company_id)
    auction_id,
    company_id,
    w.id AS wallet_id
  FROM bids AS b
  JOIN "Wallet" AS w ON w."userId" = b.user_id
  ORDER BY auction_id, company_id, sequence_no DESC
) AS mapped
WHERE dl.wallet_id IS NULL
  AND dl.auction_id = mapped.auction_id
  AND dl.company_id = mapped.company_id;

ALTER TABLE deposit_locks
  ALTER COLUMN company_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deposit_locks_wallet_id_fkey'
  ) THEN
    ALTER TABLE deposit_locks
      ADD CONSTRAINT deposit_locks_wallet_id_fkey
      FOREIGN KEY (wallet_id) REFERENCES "Wallet" (id)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS depositlock_wallet_idx
  ON deposit_locks (wallet_id);

CREATE UNIQUE INDEX IF NOT EXISTS deposit_locks_active_wallet_unique
  ON deposit_locks (auction_id, wallet_id)
  WHERE status = 'ACTIVE' AND wallet_id IS NOT NULL;

-- Keep lookup optimized for wallet-based flows
CREATE INDEX IF NOT EXISTS deposit_locks_wallet_lookup_idx
  ON deposit_locks (auction_id, wallet_id, status);

-- WalletLedger is append-only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'wallet_ledger_append_only_trigger'
  ) THEN
    CREATE TRIGGER wallet_ledger_append_only_trigger
      BEFORE UPDATE OR DELETE ON "WalletLedger"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_append_only();
  END IF;
END
$$;
