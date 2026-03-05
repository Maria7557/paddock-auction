import assert from "node:assert/strict";
import test from "node:test";

import type { PGlite } from "@electric-sql/pglite";

import { createMigratedTestDb } from "./helpers/migration_harness";

type DbAssertionContext = {
  db: PGlite;
  appliedMigrations: string[];
};

async function withMigratedDb(
  assertion: (context: DbAssertionContext) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion({ db: migratedDb.db, appliedMigrations: migratedDb.appliedMigrations });
  } finally {
    await migratedDb.cleanup();
  }
}

async function insertAuction(db: PGlite, auctionId: string): Promise<void> {
  await db.query(
    `INSERT INTO auctions (
      id,
      vehicle_id,
      seller_company_id,
      starts_at,
      ends_at
    ) VALUES ($1, $2, $3, $4, $5)`,
    [auctionId, `vehicle-${auctionId}`, `seller-${auctionId}`, "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"],
  );
}

test("migrations apply successfully on a clean database", async () => {
  await withMigratedDb(async ({ db, appliedMigrations }) => {
    const requiredMigrations = [
      "20260226072326_init",
      "20260226080650_add_role",
      "20260301143000_block2_fast_mvp_database_contract",
      "20260301170000_block3_add_ended_state",
      "20260301201500_block4_bid_runtime_columns",
      "20260301233000_block5_billing_webhook_contract",
      "20260305142000_identity_user_model",
      "20260305143000_add_wallet_model",
      "20260305160000_vehicle_model",
    ];

    assert.ok(appliedMigrations.length >= requiredMigrations.length);
    assert.deepEqual(
      appliedMigrations.filter((migration) => requiredMigrations.includes(migration)),
      requiredMigrations,
    );

    const auctionsCount = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM auctions");
    assert.equal(auctionsCount.rows[0].count, 0);
  });
});

test("partial unique active lock constraint rejects concurrent active duplicates", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-active-lock");

    await db.query(
      "INSERT INTO deposit_locks (id, auction_id, company_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
      ["lock-1", "auction-active-lock", "company-1", 100, "ACTIVE"],
    );

    await assert.rejects(
      async () => {
        await db.query(
          "INSERT INTO deposit_locks (id, auction_id, company_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
          ["lock-2", "auction-active-lock", "company-1", 150, "ACTIVE"],
        );
      },
      /deposit_locks_active_lock_unique/i,
    );

    await db.query(
      "INSERT INTO deposit_locks (id, auction_id, company_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
      ["lock-3", "auction-active-lock", "company-1", 150, "RELEASED"],
    );
  });
});

test("bid request idempotency key is unique per auction and company", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-idem-1");

    await db.query(
      `INSERT INTO bid_requests (
         id,
         auction_id,
         company_id,
         idempotency_key,
         request_hash,
         status,
         expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "bid-request-1",
        "auction-idem-1",
        "company-idem",
        "idem-123",
        "hash-1",
        "IN_PROGRESS",
        "2100-01-01T00:00:00Z",
      ],
    );

    await assert.rejects(
      async () => {
        await db.query(
          `INSERT INTO bid_requests (
             id,
             auction_id,
             company_id,
             idempotency_key,
             request_hash,
             status,
             expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            "bid-request-2",
            "auction-idem-1",
            "company-idem",
            "idem-123",
            "hash-2",
            "IN_PROGRESS",
            "2100-01-01T00:00:00Z",
          ],
        );
      },
      /bid_requests_auction_company_idempotency_key/i,
    );
  });
});

test("payment webhook events enforce unique stripe_event_id dedupe key", async () => {
  await withMigratedDb(async ({ db }) => {
    await db.query(
      "INSERT INTO payment_webhook_events (id, stripe_event_id, event_type, payload_hash, status) VALUES ($1, $2, $3, $4, $5)",
      ["w-1", "evt_123", "payment_intent.succeeded", "hash-a", "RECEIVED"],
    );

    await assert.rejects(
      async () => {
        await db.query(
          "INSERT INTO payment_webhook_events (id, stripe_event_id, event_type, payload_hash, status) VALUES ($1, $2, $3, $4, $5)",
          ["w-2", "evt_123", "payment_intent.succeeded", "hash-b", "RECEIVED"],
        );
      },
      /payment_webhook_events_stripe_event_id_key/i,
    );
  });
});

test("wallet non-negative checks reject invalid insert and update mutations", async () => {
  await withMigratedDb(async ({ db }) => {
    await assert.rejects(
      async () => {
        await db.query(
          `INSERT INTO deposit_wallets (
             id,
             company_id,
             currency,
             available_balance,
             locked_balance,
             pending_withdrawal_balance
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          ["wallet-negative", "company-wallet", "USD", -1, 0, 0],
        );
      },
      /deposit_wallets_available_balance_non_negative_check/i,
    );

    await db.query(
      `INSERT INTO deposit_wallets (
         id,
         company_id,
         currency,
         available_balance,
         locked_balance,
         pending_withdrawal_balance
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      ["wallet-1", "company-wallet", "USD", 10, 0, 0],
    );

    await assert.rejects(
      async () => {
        await db.query("UPDATE deposit_wallets SET locked_balance = -5 WHERE id = $1", ["wallet-1"]);
      },
      /deposit_wallets_locked_balance_non_negative_check/i,
    );
  });
});

test("invoice total consistency check rejects mismatched totals", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-invoice-check");

    await assert.rejects(
      async () => {
        await db.query(
          `INSERT INTO invoices (
             id,
             auction_id,
             buyer_company_id,
             seller_company_id,
             subtotal,
             commission,
             vat,
             total,
             currency,
             due_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            "invoice-1",
            "auction-invoice-check",
            "buyer-1",
            "seller-auction-invoice-check",
            100,
            10,
            5,
            999,
            "USD",
            "2026-03-04T00:00:00Z",
          ],
        );
      },
      /invoices_total_consistency_check/i,
    );
  });
});

test("append-only tables reject update and delete operations", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-append-only");

    await db.query(
      `INSERT INTO auction_state_transitions (
         id,
         auction_id,
         from_state,
         to_state,
         trigger,
         reason,
         actor_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "transition-1",
        "auction-append-only",
        "DRAFT",
        "SCHEDULED",
        "manual_publish",
        "initial publish",
        "user-1",
      ],
    );

    await assert.rejects(
      async () => {
        await db.query("UPDATE auction_state_transitions SET reason = $1 WHERE id = $2", [
          "mutated reason",
          "transition-1",
        ]);
      },
      /append-only/i,
    );

    await assert.rejects(
      async () => {
        await db.query("DELETE FROM auction_state_transitions WHERE id = $1", ["transition-1"]);
      },
      /append-only/i,
    );

    await db.query(
      "INSERT INTO financial_events (id, event_type, source_type, source_id, amount, currency) VALUES ($1, $2, $3, $4, $5, $6)",
      ["financial-event-1", "LOCK_ACQUIRED", "deposit_lock", "lock-source-1", 100, "USD"],
    );

    await assert.rejects(
      async () => {
        await db.query("DELETE FROM financial_events WHERE id = $1", ["financial-event-1"]);
      },
      /append-only/i,
    );
  });
});
