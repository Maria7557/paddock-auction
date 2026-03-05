import assert from "node:assert/strict";
import test from "node:test";

import { createAuctionLifecycleScheduler } from "../../src/modules/auction/auction_scheduler";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";
import { createMigratedTestDb } from "./helpers/migration_harness";

async function withMigratedDb(
  assertion: (context: Awaited<ReturnType<typeof createMigratedTestDb>>) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion(migratedDb);
  } finally {
    await migratedDb.cleanup();
  }
}

async function insertAuction(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    id: string;
    state: "SCHEDULED" | "LIVE" | "ENDED";
    version?: number;
    startsAt: string;
    endsAt: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO auctions (
       id,
       vehicle_id,
       seller_company_id,
       state,
       version,
       current_price,
       min_increment,
       last_bid_sequence,
       starts_at,
       ends_at
     ) VALUES ($1, $2, $3, $4, $5, 0, 1, 0, $6::timestamptz, $7::timestamptz)`,
    [
      input.id,
      `vehicle-${input.id}`,
      `seller-${input.id}`,
      input.state,
      input.version ?? 0,
      input.startsAt,
      input.endsAt,
    ],
  );
}

test("startDueAuctions transitions only due SCHEDULED auctions", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-scheduler-start-due",
      state: "SCHEDULED",
      startsAt: "2026-03-06T10:00:00Z",
      endsAt: "2026-03-06T12:00:00Z",
    });

    await insertAuction(db, {
      id: "auction-scheduler-start-future",
      state: "SCHEDULED",
      startsAt: "2026-03-06T12:30:00Z",
      endsAt: "2026-03-06T14:00:00Z",
    });

    await insertAuction(db, {
      id: "auction-scheduler-start-live",
      state: "LIVE",
      startsAt: "2026-03-06T08:00:00Z",
      endsAt: "2026-03-06T11:00:00Z",
    });

    const scheduler = createAuctionLifecycleScheduler(createPgliteTransactionRunner(db));

    const result = await scheduler.startDueAuctions({
      occurredAt: new Date("2026-03-06T11:00:00Z"),
      batchSize: 10,
    });

    assert.equal(result.processedCount, 1);
    assert.equal(result.items[0].auctionId, "auction-scheduler-start-due");
    assert.equal(result.items[0].fromState, "SCHEDULED");
    assert.equal(result.items[0].toState, "LIVE");

    const auctionRows = await db.query<{ id: string; state: string; version: number }>(
      `SELECT id, state, version
       FROM auctions
       WHERE id IN ($1, $2, $3)
       ORDER BY id ASC`,
      [
        "auction-scheduler-start-due",
        "auction-scheduler-start-future",
        "auction-scheduler-start-live",
      ],
    );

    const statesById = new Map(auctionRows.rows.map((row) => [row.id, row.state]));
    const versionsById = new Map(auctionRows.rows.map((row) => [row.id, Number(row.version)]));

    assert.equal(statesById.get("auction-scheduler-start-due"), "LIVE");
    assert.equal(statesById.get("auction-scheduler-start-future"), "SCHEDULED");
    assert.equal(statesById.get("auction-scheduler-start-live"), "LIVE");
    assert.equal(versionsById.get("auction-scheduler-start-due"), 1);

    const transitionRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'SCHEDULED'
         AND to_state = 'LIVE'
         AND trigger = 'auction_lifecycle_scheduler'`,
      ["auction-scheduler-start-due"],
    );

    assert.equal(transitionRows.rows[0].count, 1);
  });
});

test("closeDueAuctions transitions due LIVE auctions to ENDED and is idempotent", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-scheduler-close-due",
      state: "LIVE",
      startsAt: "2026-03-06T08:00:00Z",
      endsAt: "2026-03-06T10:00:00Z",
    });

    await insertAuction(db, {
      id: "auction-scheduler-close-future",
      state: "LIVE",
      startsAt: "2026-03-06T09:00:00Z",
      endsAt: "2026-03-06T12:30:00Z",
    });

    const scheduler = createAuctionLifecycleScheduler(createPgliteTransactionRunner(db));

    const first = await scheduler.closeDueAuctions({
      occurredAt: new Date("2026-03-06T11:00:00Z"),
      batchSize: 10,
    });

    const second = await scheduler.closeDueAuctions({
      occurredAt: new Date("2026-03-06T11:05:00Z"),
      batchSize: 10,
    });

    assert.equal(first.processedCount, 1);
    assert.equal(first.items[0].auctionId, "auction-scheduler-close-due");
    assert.equal(first.items[0].toState, "ENDED");
    assert.equal(second.processedCount, 0);

    const auctionRows = await db.query<{ id: string; state: string; closed_at: string | null }>(
      `SELECT id, state, closed_at
       FROM auctions
       WHERE id IN ($1, $2)
       ORDER BY id ASC`,
      ["auction-scheduler-close-due", "auction-scheduler-close-future"],
    );

    const byId = new Map(auctionRows.rows.map((row) => [row.id, row]));

    assert.equal(byId.get("auction-scheduler-close-due")?.state, "ENDED");
    assert.equal(byId.get("auction-scheduler-close-future")?.state, "LIVE");
    assert.equal(
      new Date(String(byId.get("auction-scheduler-close-due")?.closed_at)).toISOString(),
      "2026-03-06T11:00:00.000Z",
    );

    const transitionRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'LIVE'
         AND to_state = 'ENDED'
         AND trigger = 'auction_lifecycle_scheduler'`,
      ["auction-scheduler-close-due"],
    );

    assert.equal(transitionRows.rows[0].count, 1);
  });
});
