DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'LedgerType'
  ) THEN
    CREATE TYPE "LedgerType" AS ENUM (
      'DEPOSIT_TOPUP',
      'DEPOSIT_LOCK',
      'DEPOSIT_RELEASE',
      'DEPOSIT_BURN',
      'WITHDRAWAL'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "lockedBalance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WalletLedger" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "type" "LedgerType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_userId_key" ON "Wallet"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Wallet_userId_fkey'
  ) THEN
    ALTER TABLE "Wallet"
      ADD CONSTRAINT "Wallet_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WalletLedger_walletId_fkey'
  ) THEN
    ALTER TABLE "WalletLedger"
      ADD CONSTRAINT "WalletLedger_walletId_fkey"
      FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
