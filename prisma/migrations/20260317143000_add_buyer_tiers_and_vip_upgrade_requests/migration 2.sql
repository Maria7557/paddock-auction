DO $$
BEGIN
  CREATE TYPE "BuyerTier" AS ENUM ('STANDARD', 'VIP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "buyerTier" "BuyerTier" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE IF NOT EXISTS "VipUpgradeRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VipUpgradeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VipUpgradeRequest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "VipUpgradeRequest_companyId_status_idx"
  ON "VipUpgradeRequest" ("companyId", "status");

CREATE INDEX IF NOT EXISTS "VipUpgradeRequest_companyId_requestedAt_idx"
  ON "VipUpgradeRequest" ("companyId", "requestedAt");
