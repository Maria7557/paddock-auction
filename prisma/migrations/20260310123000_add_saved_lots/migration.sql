CREATE TABLE IF NOT EXISTS "saved_lots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "auction_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "saved_lots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "saved_lots_user_auction_key" ON "saved_lots"("user_id", "auction_id");

DO $$
BEGIN
  ALTER TABLE "saved_lots"
    ADD CONSTRAINT "saved_lots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "saved_lots"
    ADD CONSTRAINT "saved_lots_auction_id_fkey"
    FOREIGN KEY ("auction_id") REFERENCES "auctions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
