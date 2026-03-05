import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError } from "../../lib/domain_errors";
import { createDepositService } from "./deposit_service";
import { createMigratedTestDb } from "../../../tests/integration/helpers/migration_harness";
import { createPgliteTransactionRunner } from "../../../tests/integration/helpers/pglite_sql_runner";

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

async function seedDefaultedAuction(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    auctionId: string;
    companyId: string;
    userId: string;
    bidId: string;
    lockId: string;
    amount: number;
    walletLockedBalance: number;
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
       ends_at,
       winner_company_id,
       highest_bid_id,
       closed_at
     ) VALUES ($1, $2, $3, 'DEFAULTED', 3, $4, 1, 1, $5::timestamptz, $6::timestamptz, $7, $8, $9::timestamptz)`,
    [
      input.auctionId,
      `vehicle-${input.auctionId}`,
      `seller-${input.auctionId}`,
      input.amount,
      "2026-03-01T00:00:00Z",
      "2026-03-02T00:00:00Z",
      input.companyId,
      input.bidId,
      "2026-03-03T12:00:00Z",
    ],
  );

  await db.query(
    `INSERT INTO bids (
       id,
       auction_id,
       company_id,
       user_id,
       amount,
       sequence_no,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, 1, $6::timestamptz)`,
    [input.bidId, input.auctionId, input.companyId, input.userId, input.amount, "2026-03-01T12:00:00Z"],
  );

  await db.query(
    `INSERT INTO deposit_locks (
       id,
       auction_id,
       company_id,
       amount,
       status,
       created_at
     ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5::timestamptz)`,
    [input.lockId, input.auctionId, input.companyId, input.amount, "2026-03-01T12:05:00Z"],
  );

  await db.query(
    `INSERT INTO "User" (
       id,
       email
     ) VALUES ($1, $2)`,
    [input.userId, `${input.userId}@example.test`],
  );

  await db.query(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance"
     ) VALUES ($1, $2, 0, $3)`,
    [`wallet-${input.userId}`, input.userId, input.walletLockedBalance],
  );
}

test("winner default burns deposit lock, decreases wallet lockedBalance, and writes DEPOSIT_BURN ledger", async () => {
  await withMigratedDb(async ({ db }) => {
    await seedDefaultedAuction(db, {
      auctionId: "auction-wallet-burn-1",
      companyId: "company-wallet-burn-1",
      userId: "user-wallet-burn-1",
      bidId: "bid-wallet-burn-1",
      lockId: "lock-wallet-burn-1",
      amount: 200,
      walletLockedBalance: 200,
    });

    const service = createDepositService(
      createPgliteTransactionRunner(db),
      () => new Date("2026-03-05T10:00:00Z"),
    );

    const result = await service.burnDepositForDefault("auction-wallet-burn-1");

    assert.equal(result.auctionId, "auction-wallet-burn-1");
    assert.equal(result.winningBidId, "bid-wallet-burn-1");
    assert.equal(result.lockId, "lock-wallet-burn-1");
    assert.equal(result.burnedAmount, 200);

    const lockRow = await db.query<{ status: string; burned_at: string | null }>(
      `SELECT status, burned_at
       FROM deposit_locks
       WHERE id = $1`,
      ["lock-wallet-burn-1"],
    );

    assert.equal(lockRow.rows[0].status, "BURNED");
    assert.ok(lockRow.rows[0].burned_at);

    const walletRow = await db.query<{ lockedBalance: number }>(
      `SELECT "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-wallet-burn-1"],
    );

    assert.equal(Number(walletRow.rows[0].lockedBalance), 0);

    const ledgerRow = await db.query<{ type: string; amount: number; reference: string | null }>(
      `SELECT type, amount, reference
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-user-wallet-burn-1"],
    );

    assert.equal(ledgerRow.rows.length, 1);
    assert.equal(ledgerRow.rows[0].type, "DEPOSIT_BURN");
    assert.equal(Number(ledgerRow.rows[0].amount), 200);
    assert.equal(ledgerRow.rows[0].reference, "lock-wallet-burn-1");
  });
});

test("burnDepositForDefault is transactional when wallet lockedBalance is insufficient", async () => {
  await withMigratedDb(async ({ db }) => {
    await seedDefaultedAuction(db, {
      auctionId: "auction-wallet-burn-rollback-1",
      companyId: "company-wallet-burn-rollback-1",
      userId: "user-wallet-burn-rollback-1",
      bidId: "bid-wallet-burn-rollback-1",
      lockId: "lock-wallet-burn-rollback-1",
      amount: 150,
      walletLockedBalance: 20,
    });

    const service = createDepositService(
      createPgliteTransactionRunner(db),
      () => new Date("2026-03-05T10:00:00Z"),
    );

    await assert.rejects(
      async () => {
        await service.burnDepositForDefault("auction-wallet-burn-rollback-1");
      },
      (error: unknown) => {
        assert.ok(error instanceof DomainConflictError);
        assert.equal(error.code, "WALLET_LOCKED_BALANCE_INSUFFICIENT");
        return true;
      },
    );

    const lockRow = await db.query<{ status: string; burned_at: string | null }>(
      `SELECT status, burned_at
       FROM deposit_locks
       WHERE id = $1`,
      ["lock-wallet-burn-rollback-1"],
    );

    assert.equal(lockRow.rows[0].status, "ACTIVE");
    assert.equal(lockRow.rows[0].burned_at, null);

    const walletRow = await db.query<{ lockedBalance: number }>(
      `SELECT "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-wallet-burn-rollback-1"],
    );

    assert.equal(Number(walletRow.rows[0].lockedBalance), 20);

    const ledgerCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-user-wallet-burn-rollback-1"],
    );

    assert.equal(ledgerCount.rows[0].count, 0);
  });
});
