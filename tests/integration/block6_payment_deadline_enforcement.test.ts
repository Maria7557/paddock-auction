import assert from "node:assert/strict";
import test from "node:test";

import { createPaymentDeadlineEnforcementService } from "../../src/modules/billing/application/payment_deadline_enforcement_service";
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

async function insertPaymentPendingAuction(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    auctionId: string;
    buyerCompanyId: string;
    sellerCompanyId: string;
    currentPrice: number;
    closedAt: string;
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
       closed_at
     ) VALUES ($1, $2, $3, 'PAYMENT_PENDING', 2, $4, 1, 1, $5::timestamptz, $6::timestamptz, $7, $8::timestamptz)`,
    [
      input.auctionId,
      `vehicle-${input.auctionId}`,
      input.sellerCompanyId,
      input.currentPrice,
      "2026-03-01T00:00:00Z",
      "2026-03-02T00:00:00Z",
      input.buyerCompanyId,
      input.closedAt,
    ],
  );
}

async function insertInvoiceAndDeadline(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    invoiceId: string;
    auctionId: string;
    buyerCompanyId: string;
    sellerCompanyId: string;
    total: number;
    status: "ISSUED" | "PAID" | "DEFAULTED";
    dueAt: string;
    deadlineId: string;
    deadlineStatus?: "ACTIVE" | "PAID" | "DEFAULTED" | "RESOLVED";
  },
): Promise<void> {
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
       status,
       issued_at,
       due_at,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'USD', $6::"InvoiceStatus", $7::timestamptz, $8::timestamptz, $7::timestamptz, $7::timestamptz)`,
    [
      input.invoiceId,
      input.auctionId,
      input.buyerCompanyId,
      input.sellerCompanyId,
      input.total,
      input.status,
      "2026-03-01T12:00:00Z",
      input.dueAt,
    ],
  );

  await db.query(
    `INSERT INTO payment_deadlines (
       id,
       auction_id,
       buyer_company_id,
       due_at,
       status,
       escalated_flag,
       created_at
     ) VALUES ($1, $2, $3, $4::timestamptz, $5::"PaymentDeadlineStatus", false, $6::timestamptz)`,
    [
      input.deadlineId,
      input.auctionId,
      input.buyerCompanyId,
      input.dueAt,
      input.deadlineStatus ?? "ACTIVE",
      "2026-03-01T12:00:00Z",
    ],
  );
}

async function insertWalletAndActiveLock(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    companyId: string;
    walletId: string;
    auctionId: string;
    lockId: string;
    lockAmount: number;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO deposit_locks (
       id,
       auction_id,
       wallet_id,
       company_id,
       amount,
       status,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6::timestamptz)`,
    [
      input.lockId,
      input.auctionId,
      input.walletId,
      input.companyId,
      input.lockAmount,
      "2026-03-01T12:00:00Z",
    ],
  );
}

async function insertWinningBidderWalletAndBid(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    auctionId: string;
    companyId: string;
    userId: string;
    bidId: string;
    amount: number;
    lockedBalance: number;
    balance?: number;
  },
): Promise<void> {
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
     ) VALUES ($1, $2, $3, $4)`,
    [`wallet-${input.userId}`, input.userId, input.balance ?? 0, input.lockedBalance],
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
    `UPDATE auctions
     SET highest_bid_id = $2
     WHERE id = $1`,
    [input.auctionId, input.bidId],
  );
}

test("default-and-burn happens once", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertPaymentPendingAuction(db, {
      auctionId: "auction-block6-default-1",
      buyerCompanyId: "buyer-default-1",
      sellerCompanyId: "seller-default-1",
      currentPrice: 220,
      closedAt: "2026-03-01T12:00:00Z",
    });

    await insertInvoiceAndDeadline(db, {
      invoiceId: "invoice-block6-default-1",
      auctionId: "auction-block6-default-1",
      buyerCompanyId: "buyer-default-1",
      sellerCompanyId: "seller-default-1",
      total: 220,
      status: "ISSUED",
      dueAt: "2026-03-03T12:00:00Z",
      deadlineId: "deadline-block6-default-1",
    });

    await insertWinningBidderWalletAndBid(db, {
      auctionId: "auction-block6-default-1",
      companyId: "buyer-default-1",
      userId: "winner-default-1",
      bidId: "bid-block6-default-1",
      amount: 220,
      lockedBalance: 220,
    });
    await insertWalletAndActiveLock(db, {
      companyId: "buyer-default-1",
      walletId: "wallet-winner-default-1",
      auctionId: "auction-block6-default-1",
      lockId: "lock-block6-default-1",
      lockAmount: 220,
    });

    const service = createPaymentDeadlineEnforcementService(createPgliteTransactionRunner(db));

    const result = await service.enforceDuePaymentDeadlines({
      occurredAt: new Date("2026-03-05T00:00:00Z"),
      batchSize: 10,
    });

    assert.equal(result.processedCount, 1);
    assert.equal(result.defaultedCount, 1);
    assert.equal(result.paidCount, 0);
    assert.equal(result.noopCount, 0);

    const invoiceRow = await db.query<{ status: string }>(
      "SELECT status FROM invoices WHERE id = $1",
      ["invoice-block6-default-1"],
    );
    assert.equal(invoiceRow.rows[0].status, "DEFAULTED");

    const deadlineRow = await db.query<{ status: string }>(
      "SELECT status FROM payment_deadlines WHERE id = $1",
      ["deadline-block6-default-1"],
    );
    assert.equal(deadlineRow.rows[0].status, "DEFAULTED");

    const auctionRow = await db.query<{ state: string }>(
      "SELECT state FROM auctions WHERE id = $1",
      ["auction-block6-default-1"],
    );
    assert.equal(auctionRow.rows[0].state, "DEFAULTED");

    const lockRow = await db.query<{ status: string }>(
      "SELECT status FROM deposit_locks WHERE id = $1",
      ["lock-block6-default-1"],
    );
    assert.equal(lockRow.rows[0].status, "BURNED");

    const transitionCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'PAYMENT_PENDING'
         AND to_state = 'DEFAULTED'`,
      ["auction-block6-default-1"],
    );
    assert.equal(transitionCount.rows[0].count, 1);

    const burnEventCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM financial_events
       WHERE source_type = 'deposit_lock'
         AND source_id = $1
         AND event_type = 'DEPOSIT_BURN'`,
      ["lock-block6-default-1"],
    );
    assert.equal(burnEventCount.rows[0].count, 1);

    const winnerWalletRow = await db.query<{ lockedBalance: number }>(
      `SELECT "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["winner-default-1"],
    );
    assert.equal(Number(winnerWalletRow.rows[0].lockedBalance), 0);

    const winnerWalletLedger = await db.query<{ type: string; amount: number; reference: string | null }>(
      `SELECT type, amount, reference
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-winner-default-1"],
    );
    assert.equal(winnerWalletLedger.rows.length, 1);
    assert.equal(winnerWalletLedger.rows[0].type, "DEPOSIT_BURN");
    assert.equal(Number(winnerWalletLedger.rows[0].amount), 220);
    assert.equal(winnerWalletLedger.rows[0].reference, "lock-block6-default-1");
  });
});

test("rerun is idempotent and does not double-burn", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertPaymentPendingAuction(db, {
      auctionId: "auction-block6-rerun-1",
      buyerCompanyId: "buyer-rerun-1",
      sellerCompanyId: "seller-rerun-1",
      currentPrice: 190,
      closedAt: "2026-03-01T12:00:00Z",
    });

    await insertInvoiceAndDeadline(db, {
      invoiceId: "invoice-block6-rerun-1",
      auctionId: "auction-block6-rerun-1",
      buyerCompanyId: "buyer-rerun-1",
      sellerCompanyId: "seller-rerun-1",
      total: 190,
      status: "ISSUED",
      dueAt: "2026-03-03T12:00:00Z",
      deadlineId: "deadline-block6-rerun-1",
    });

    await insertWinningBidderWalletAndBid(db, {
      auctionId: "auction-block6-rerun-1",
      companyId: "buyer-rerun-1",
      userId: "winner-rerun-1",
      bidId: "bid-block6-rerun-1",
      amount: 190,
      lockedBalance: 190,
    });
    await insertWalletAndActiveLock(db, {
      companyId: "buyer-rerun-1",
      walletId: "wallet-winner-rerun-1",
      auctionId: "auction-block6-rerun-1",
      lockId: "lock-block6-rerun-1",
      lockAmount: 190,
    });

    const service = createPaymentDeadlineEnforcementService(createPgliteTransactionRunner(db));

    const first = await service.enforceDuePaymentDeadlines({
      occurredAt: new Date("2026-03-05T00:00:00Z"),
      batchSize: 10,
    });

    const second = await service.enforceDuePaymentDeadlines({
      occurredAt: new Date("2026-03-05T00:10:00Z"),
      batchSize: 10,
    });

    assert.equal(first.defaultedCount, 1);
    assert.equal(second.processedCount, 0);
    assert.equal(second.defaultedCount, 0);

    const burnEventCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM financial_events
       WHERE source_type = 'deposit_lock'
         AND source_id = $1
         AND event_type = 'DEPOSIT_BURN'`,
      ["lock-block6-rerun-1"],
    );

    assert.equal(burnEventCount.rows[0].count, 1);

    const walletLedgerCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM "WalletLedger"
       WHERE "walletId" = $1
         AND type = 'DEPOSIT_BURN'`,
      ["wallet-winner-rerun-1"],
    );
    assert.equal(walletLedgerCount.rows[0].count, 1);
  });
});

test("already paid invoice is skipped safely", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertPaymentPendingAuction(db, {
      auctionId: "auction-block6-paid-1",
      buyerCompanyId: "buyer-paid-1",
      sellerCompanyId: "seller-paid-1",
      currentPrice: 140,
      closedAt: "2026-03-01T12:00:00Z",
    });

    await insertInvoiceAndDeadline(db, {
      invoiceId: "invoice-block6-paid-1",
      auctionId: "auction-block6-paid-1",
      buyerCompanyId: "buyer-paid-1",
      sellerCompanyId: "seller-paid-1",
      total: 140,
      status: "PAID",
      dueAt: "2026-03-03T12:00:00Z",
      deadlineId: "deadline-block6-paid-1",
    });

    const service = createPaymentDeadlineEnforcementService(createPgliteTransactionRunner(db));

    const result = await service.enforceDuePaymentDeadlines({
      occurredAt: new Date("2026-03-05T00:00:00Z"),
      batchSize: 10,
    });

    assert.equal(result.processedCount, 1);
    assert.equal(result.defaultedCount, 0);
    assert.equal(result.paidCount, 1);

    const deadlineRow = await db.query<{ status: string }>(
      "SELECT status FROM payment_deadlines WHERE id = $1",
      ["deadline-block6-paid-1"],
    );
    assert.equal(deadlineRow.rows[0].status, "PAID");

    const auctionRow = await db.query<{ state: string }>(
      "SELECT state FROM auctions WHERE id = $1",
      ["auction-block6-paid-1"],
    );
    assert.equal(auctionRow.rows[0].state, "PAYMENT_PENDING");

    const burnEventCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM financial_events
       WHERE auction_id = $1
         AND event_type = 'DEPOSIT_BURN'`,
      ["auction-block6-paid-1"],
    );
    assert.equal(burnEventCount.rows[0].count, 0);
  });
});

test("wallet balance never goes negative on burn path", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertPaymentPendingAuction(db, {
      auctionId: "auction-block6-wallet-1",
      buyerCompanyId: "buyer-wallet-1",
      sellerCompanyId: "seller-wallet-1",
      currentPrice: 100,
      closedAt: "2026-03-01T12:00:00Z",
    });

    await insertInvoiceAndDeadline(db, {
      invoiceId: "invoice-block6-wallet-1",
      auctionId: "auction-block6-wallet-1",
      buyerCompanyId: "buyer-wallet-1",
      sellerCompanyId: "seller-wallet-1",
      total: 100,
      status: "ISSUED",
      dueAt: "2026-03-03T12:00:00Z",
      deadlineId: "deadline-block6-wallet-1",
    });

    await insertWinningBidderWalletAndBid(db, {
      auctionId: "auction-block6-wallet-1",
      companyId: "buyer-wallet-1",
      userId: "winner-wallet-1",
      bidId: "bid-block6-wallet-1",
      amount: 100,
      lockedBalance: 100,
    });
    await insertWalletAndActiveLock(db, {
      companyId: "buyer-wallet-1",
      walletId: "wallet-winner-wallet-1",
      auctionId: "auction-block6-wallet-1",
      lockId: "lock-block6-wallet-1",
      lockAmount: 100,
    });

    const service = createPaymentDeadlineEnforcementService(createPgliteTransactionRunner(db));

    const result = await service.enforceDuePaymentDeadlines({
      occurredAt: new Date("2026-03-05T00:00:00Z"),
      batchSize: 10,
    });

    assert.equal(result.defaultedCount, 1);

    const walletRow = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["winner-wallet-1"],
    );

    assert.ok(Number(walletRow.rows[0].balance) >= 0);
    assert.ok(Number(walletRow.rows[0].lockedBalance) >= 0);
    assert.equal(Number(walletRow.rows[0].balance), 0);
    assert.equal(Number(walletRow.rows[0].lockedBalance), 0);

    const winnerWalletRow = await db.query<{ lockedBalance: number }>(
      `SELECT "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["winner-wallet-1"],
    );
    assert.equal(Number(winnerWalletRow.rows[0].lockedBalance), 0);
  });
});

test("default burn is transactional when winner wallet lock is insufficient", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertPaymentPendingAuction(db, {
      auctionId: "auction-block6-wallet-fail-1",
      buyerCompanyId: "buyer-wallet-fail-1",
      sellerCompanyId: "seller-wallet-fail-1",
      currentPrice: 150,
      closedAt: "2026-03-01T12:00:00Z",
    });

    await insertInvoiceAndDeadline(db, {
      invoiceId: "invoice-block6-wallet-fail-1",
      auctionId: "auction-block6-wallet-fail-1",
      buyerCompanyId: "buyer-wallet-fail-1",
      sellerCompanyId: "seller-wallet-fail-1",
      total: 150,
      status: "ISSUED",
      dueAt: "2026-03-03T12:00:00Z",
      deadlineId: "deadline-block6-wallet-fail-1",
    });

    await insertWinningBidderWalletAndBid(db, {
      auctionId: "auction-block6-wallet-fail-1",
      companyId: "buyer-wallet-fail-1",
      userId: "winner-wallet-fail-1",
      bidId: "bid-block6-wallet-fail-1",
      amount: 150,
      lockedBalance: 10,
    });
    await insertWalletAndActiveLock(db, {
      companyId: "buyer-wallet-fail-1",
      walletId: "wallet-winner-wallet-fail-1",
      auctionId: "auction-block6-wallet-fail-1",
      lockId: "lock-block6-wallet-fail-1",
      lockAmount: 150,
    });

    const service = createPaymentDeadlineEnforcementService(createPgliteTransactionRunner(db));

    await assert.rejects(
      async () => {
        await service.enforceDuePaymentDeadlines({
          occurredAt: new Date("2026-03-05T00:00:00Z"),
          batchSize: 10,
        });
      },
      /Insufficient winner wallet locked balance/i,
    );

    const invoiceRow = await db.query<{ status: string }>(
      "SELECT status FROM invoices WHERE id = $1",
      ["invoice-block6-wallet-fail-1"],
    );
    assert.equal(invoiceRow.rows[0].status, "ISSUED");

    const deadlineRow = await db.query<{ status: string }>(
      "SELECT status FROM payment_deadlines WHERE id = $1",
      ["deadline-block6-wallet-fail-1"],
    );
    assert.equal(deadlineRow.rows[0].status, "ACTIVE");

    const auctionRow = await db.query<{ state: string }>(
      "SELECT state FROM auctions WHERE id = $1",
      ["auction-block6-wallet-fail-1"],
    );
    assert.equal(auctionRow.rows[0].state, "PAYMENT_PENDING");

    const lockRow = await db.query<{ status: string }>(
      "SELECT status FROM deposit_locks WHERE id = $1",
      ["lock-block6-wallet-fail-1"],
    );
    assert.equal(lockRow.rows[0].status, "ACTIVE");

    const winnerWalletRow = await db.query<{ lockedBalance: number }>(
      `SELECT "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["winner-wallet-fail-1"],
    );
    assert.equal(Number(winnerWalletRow.rows[0].lockedBalance), 10);

    const burnEventCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM financial_events
       WHERE source_type = 'deposit_lock'
         AND source_id = $1
         AND event_type = 'DEPOSIT_BURN'`,
      ["lock-block6-wallet-fail-1"],
    );
    assert.equal(burnEventCount.rows[0].count, 0);

    const walletLedgerCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM "WalletLedger"
       WHERE "walletId" = $1
         AND type = 'DEPOSIT_BURN'`,
      ["wallet-winner-wallet-fail-1"],
    );
    assert.equal(walletLedgerCount.rows[0].count, 0);
  });
});
