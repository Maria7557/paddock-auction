-- CreateEnum
CREATE TYPE "AuctionEventState" AS ENUM ('SCHEDULED', 'LIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventLotState" AS ENUM ('QUEUED', 'ON_BLOCK', 'LAST_CHANCE_1', 'LAST_CHANCE_2', 'SOLD', 'UNSOLD', 'CLOSED');

-- CreateTable
CREATE TABLE "auction_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "state" "AuctionEventState" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_event_lots" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "state" "EventLotState" NOT NULL DEFAULT 'QUEUED',
    "call_round" INTEGER NOT NULL DEFAULT 0,
    "on_block_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "auction_event_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_event_runtimes" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "current_lot_id" TEXT,
    "current_position" INTEGER NOT NULL DEFAULT 0,
    "call_ends_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_event_runtimes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_events_state_idx" ON "auction_events"("state");

-- CreateIndex
CREATE INDEX "auction_event_lots_event_state_idx" ON "auction_event_lots"("event_id", "state");

-- CreateIndex
CREATE INDEX "auction_event_lots_auction_id_idx" ON "auction_event_lots"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_lots_event_position_key" ON "auction_event_lots"("event_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_lots_event_auction_key" ON "auction_event_lots"("event_id", "auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_runtimes_event_id_key" ON "auction_event_runtimes"("event_id");

-- AddForeignKey
ALTER TABLE "auction_event_lots"
ADD CONSTRAINT "auction_event_lots_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "auction_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_event_lots"
ADD CONSTRAINT "auction_event_lots_auction_id_fkey"
FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_event_runtimes"
ADD CONSTRAINT "auction_event_runtimes_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "auction_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
