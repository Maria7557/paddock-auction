-- CreateTable
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "lockedBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wallet_balance_non_negative_check" CHECK ("balance" >= 0),
  CONSTRAINT "Wallet_lockedBalance_non_negative_check" CHECK ("lockedBalance" >= 0),
  CONSTRAINT "Wallet_lockedBalance_lte_balance_check" CHECK ("lockedBalance" <= "balance"),
  CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
