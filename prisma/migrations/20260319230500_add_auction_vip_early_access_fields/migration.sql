DO $$
BEGIN
  CREATE TYPE "VipAccessPolicy" AS ENUM ('NONE', 'VIP_EARLY_ACCESS_24H', 'UNDETERMINED_RESTRICTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "auctions"
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "vip_access_policy" "VipAccessPolicy" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "vip_release_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "vip_policy_reason" TEXT;

CREATE INDEX IF NOT EXISTS "auctions_vip_access_policy_vip_release_at_idx"
  ON "auctions" ("vip_access_policy", "vip_release_at");

CREATE INDEX IF NOT EXISTS "auctions_state_vip_release_at_idx"
  ON "auctions" ("state", "vip_release_at");
