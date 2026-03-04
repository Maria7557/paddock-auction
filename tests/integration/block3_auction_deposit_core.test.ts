import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError } from "../../src/lib/domain_errors";
import { createAuctionTransitionService } from "../../src/modules/auction/application/auction_transition_service";
import { createDepositCommandService } from "../../src/modules/deposits/application/deposit_command_service";
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

async function insertAuction(db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"], auctionId: string, state = "DRAFT"): Promise<void> {
  await db.query(
    `INSERT INTO auctions (
       id,
       vehicle_id,
       seller_company_id,
       state,
       starts_at,
       ends_at
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [auctionId, `vehicle-${auctionId}`, `seller-${auctionId}`, state, "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"],
  );
}

test("auction transition persists exactly one transition row per valid transition", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-transition-1", "DRAFT");

    const transactionRunner = createPgliteTransactionRunner(db);
    const transitionService = createAuctionTransitionService(transactionRunner);

    const result = await transitionService.transitionAuctionState({
      auctionId: "auction-transition-1",
      toState: "SCHEDULED",
      trigger: "manual_publish",
      reason: "operator publish",
      actorId: "admin-1",
      occurredAt: new Date("2026-03-01T10:00:00Z"),
    });

    assert.equal(result.fromState, "DRAFT");
    assert.equal(result.toState, "SCHEDULED");
    assert.equal(result.version, 1);

    const auctionRows = await db.query<{ state: string; version: number }>(
      "SELECT state, version FROM auctions WHERE id = $1",
      ["auction-transition-1"],
    );

    assert.equal(auctionRows.rows[0].state, "SCHEDULED");
    assert.equal(auctionRows.rows[0].version, 1);

    const transitionRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'DRAFT'
         AND to_state = 'SCHEDULED'`,
      ["auction-transition-1"],
    );

    assert.equal(transitionRows.rows[0].count, 1);

    await assert.rejects(
      async () => {
        await transitionService.transitionAuctionState({
          auctionId: "auction-transition-1",
          toState: "PAID",
          trigger: "invalid_jump",
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof DomainConflictError);
        assert.equal(error.code, "AUCTION_INVALID_TRANSITION");
        assert.equal(error.status, 409);
        return true;
      },
    );

    const transitionRowsAfterInvalid = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM auction_state_transitions WHERE auction_id = $1",
      ["auction-transition-1"],
    );

    assert.equal(transitionRowsAfterInvalid.rows[0].count, 1);
  });
});

test("wallet remains non-negative under concurrent lock and release attempts", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-wallet-1");
    await insertAuction(db, "auction-wallet-2");

    const transactionRunner = createPgliteTransactionRunner(db);
    const depositService = createDepositCommandService(transactionRunner);

    await depositService.adminWalletCredit({
      companyId: "company-wallet-1",
      currency: "USD",
      amount: 100,
    });

    const acquireAttempts = await Promise.allSettled([
      depositService.acquireDepositLock({
        auctionId: "auction-wallet-1",
        companyId: "company-wallet-1",
        currency: "USD",
        amount: 80,
      }),
      depositService.acquireDepositLock({
        auctionId: "auction-wallet-2",
        companyId: "company-wallet-1",
        currency: "USD",
        amount: 80,
      }),
    ]);

    const successfulAcquire = acquireAttempts.find(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof depositService.acquireDepositLock>>> =>
        attempt.status === "fulfilled",
    );

    assert.ok(successfulAcquire);
    const failedAcquireCount = acquireAttempts.filter((attempt) => attempt.status === "rejected").length;
    assert.equal(failedAcquireCount, 1);

    const lockId = successfulAcquire.value.lock.id;

    const releaseAttempts = await Promise.allSettled([
      depositService.releaseDepositLock({
        lockId,
        currency: "USD",
      }),
      depositService.releaseDepositLock({
        lockId,
        currency: "USD",
      }),
    ]);

    const releaseSuccessCount = releaseAttempts.filter((attempt) => attempt.status === "fulfilled").length;
    assert.equal(releaseSuccessCount, 1);

    const walletRows = await db.query<{ available_balance: string; locked_balance: string }>(
      `SELECT available_balance, locked_balance
       FROM deposit_wallets
       WHERE company_id = $1 AND currency = $2`,
      ["company-wallet-1", "USD"],
    );

    const available = Number(walletRows.rows[0].available_balance);
    const locked = Number(walletRows.rows[0].locked_balance);

    assert.ok(available >= 0);
    assert.ok(locked >= 0);
    assert.equal(available, 100);
    assert.equal(locked, 0);
  });
});

test("deposit lock lifecycle only permits ACTIVE to RELEASED or BURNED", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, "auction-lifecycle-1");
    await insertAuction(db, "auction-lifecycle-2");

    const transactionRunner = createPgliteTransactionRunner(db);
    const depositService = createDepositCommandService(transactionRunner);

    await depositService.adminWalletCredit({
      companyId: "company-lifecycle",
      currency: "USD",
      amount: 200,
    });

    const firstLock = await depositService.acquireDepositLock({
      auctionId: "auction-lifecycle-1",
      companyId: "company-lifecycle",
      currency: "USD",
      amount: 50,
    });

    await depositService.releaseDepositLock({
      lockId: firstLock.lock.id,
      currency: "USD",
    });

    await assert.rejects(
      async () => {
        await depositService.burnDepositLock({
          lockId: firstLock.lock.id,
          currency: "USD",
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof DomainConflictError);
        assert.equal(error.code, "DEPOSIT_LOCK_INVALID_LIFECYCLE");
        assert.equal(error.status, 409);
        return true;
      },
    );

    const secondLock = await depositService.acquireDepositLock({
      auctionId: "auction-lifecycle-2",
      companyId: "company-lifecycle",
      currency: "USD",
      amount: 70,
    });

    const burned = await depositService.burnDepositLock({
      lockId: secondLock.lock.id,
      currency: "USD",
    });

    assert.equal(burned.lock.status, "BURNED");

    const lifecycleRows = await db.query<{ id: string; status: string }>(
      "SELECT id, status FROM deposit_locks WHERE id IN ($1, $2) ORDER BY id",
      [firstLock.lock.id, secondLock.lock.id],
    );

    const statuses = lifecycleRows.rows.map((row) => row.status).sort();
    assert.deepEqual(statuses, ["BURNED", "RELEASED"]);
  });
});
