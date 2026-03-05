import assert from "node:assert/strict";
import test from "node:test";

import { createWinnerFinalizationService } from "../../src/modules/billing/application/winner_finalization_service";
import { createPaymentIntentService } from "../../src/modules/billing/application/payment_intent_service";
import { createStripeWebhookService } from "../../src/modules/billing/application/stripe_webhook_service";
import { createPostPaymentIntentHandler } from "../../src/modules/billing/transport/post_payment_intent_handler";
import { createPostStripeWebhookHandler } from "../../src/modules/billing/transport/post_stripe_webhook_handler";
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
    state?: string;
    currentPrice?: number;
    winnerCompanyId?: string | null;
    closedAt?: string | null;
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
     ) VALUES ($1, $2, $3, $4, 0, $5, 1, 0, $6, $7, $8, $9)`,
    [
      input.id,
      `vehicle-${input.id}`,
      `seller-${input.id}`,
      input.state ?? "ENDED",
      input.currentPrice ?? 200,
      "2026-03-01T00:00:00Z",
      "2026-03-02T00:00:00Z",
      input.winnerCompanyId ?? null,
      input.closedAt ?? null,
    ],
  );
}

async function insertWallet(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  companyId: string,
  input: { available: number; locked?: number; currency?: string },
): Promise<void> {
  await db.query(
    `INSERT INTO "User" (
       id,
       email
     ) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [companyId, `${companyId}@example.test`],
  );

  await db.query(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance"
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT ("userId")
     DO UPDATE SET
       balance = EXCLUDED.balance,
       "lockedBalance" = EXCLUDED."lockedBalance"`,
    [
      `wallet-${companyId}`,
      companyId,
      input.available,
      input.locked ?? 0,
    ],
  );
}

async function insertUserWallet(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: { userId: string; walletId: string; balance?: number; lockedBalance?: number },
): Promise<void> {
  await db.query(
    `INSERT INTO "User" (id, email) VALUES ($1, $2)`,
    [input.userId, `${input.userId}@example.test`],
  );

  await db.query(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance"
     ) VALUES ($1, $2, $3, $4)`,
    [input.walletId, input.userId, input.balance ?? 0, input.lockedBalance ?? 0],
  );
}

async function insertActiveDepositLock(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    id: string;
    auctionId: string;
    companyId: string;
    walletId: string;
    amount: number;
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
      input.id,
      input.auctionId,
      input.walletId,
      input.companyId,
      input.amount,
      "2026-03-01T12:00:00Z",
    ],
  );
}

async function parseResponse(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown>; errorCode: string | null }> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    errorCode: response.headers.get("x-error-code"),
  };
}

function buildPaymentIntentRequest(invoiceId: string, idempotencyKey: string): Request {
  return new Request(`https://example.com/api/payments/invoices/${invoiceId}/intent`, {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
    },
  });
}

function buildWebhookRequest(payload: Record<string, unknown>): Request {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "test-signature",
    },
    body: JSON.stringify(payload),
  });
}

async function createFinalizedInvoice(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    auctionId: string;
    winnerCompanyId: string;
    closedAt: Date;
  },
): Promise<{ invoiceId: string; deadlineId: string }> {
  const service = createWinnerFinalizationService(createPgliteTransactionRunner(db));

  const result = await service.finalizeAuctionWinner({
    auctionId: input.auctionId,
    winnerCompanyId: input.winnerCompanyId,
    occurredAt: input.closedAt,
    actorId: "admin-1",
    trigger: "close_winner_finalization",
  });

  return {
    invoiceId: result.invoiceId,
    deadlineId: result.paymentDeadlineId,
  };
}

test("invoice and payment deadline are created once during winner finalization", async () => {
  await withMigratedDb(async ({ db }) => {
    const closedAt = new Date("2026-03-01T12:00:00Z");
    await insertAuction(db, {
      id: "auction-block5-finalize",
      state: "ENDED",
      currentPrice: 250,
      winnerCompanyId: "company-winner-1",
      closedAt: closedAt.toISOString(),
    });

    const service = createWinnerFinalizationService(createPgliteTransactionRunner(db));

    const first = await service.finalizeAuctionWinner({
      auctionId: "auction-block5-finalize",
      winnerCompanyId: "company-winner-1",
      occurredAt: closedAt,
      actorId: "admin-1",
      trigger: "close_winner_finalization",
    });

    const second = await service.finalizeAuctionWinner({
      auctionId: "auction-block5-finalize",
      winnerCompanyId: "company-winner-1",
      occurredAt: closedAt,
      actorId: "admin-1",
      trigger: "close_winner_finalization",
    });

    assert.equal(first.invoiceId, second.invoiceId);
    assert.equal(first.paymentDeadlineId, second.paymentDeadlineId);

    const invoiceCount = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM invoices WHERE auction_id = $1",
      ["auction-block5-finalize"],
    );
    assert.equal(invoiceCount.rows[0].count, 1);

    const deadlineCount = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM payment_deadlines WHERE auction_id = $1",
      ["auction-block5-finalize"],
    );
    assert.equal(deadlineCount.rows[0].count, 1);

    const transitionCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'ENDED'
         AND to_state = 'PAYMENT_PENDING'`,
      ["auction-block5-finalize"],
    );
    assert.equal(transitionCount.rows[0].count, 1);

    const dueAtRow = await db.query<{ due_at: string | Date }>(
      "SELECT due_at FROM payment_deadlines WHERE id = $1",
      [first.paymentDeadlineId],
    );

    assert.equal(new Date(dueAtRow.rows[0].due_at).toISOString(), "2026-03-03T12:00:00.000Z");
  });
});

test("payment intent endpoint enforces idempotency by invoice and key", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-block5-intent",
      state: "ENDED",
      currentPrice: 300,
      winnerCompanyId: "company-intent-1",
      closedAt: "2026-03-01T15:00:00Z",
    });

    const { invoiceId } = await createFinalizedInvoice(db, {
      auctionId: "auction-block5-intent",
      winnerCompanyId: "company-intent-1",
      closedAt: new Date("2026-03-01T15:00:00Z"),
    });

    let gatewayCalls = 0;

    const paymentIntentService = createPaymentIntentService(
      createPgliteTransactionRunner(db),
      async ({ idempotencyKey }) => {
        gatewayCalls += 1;
        return {
          stripePaymentIntentId: `pi_${idempotencyKey}`,
          clientSecret: `secret_${idempotencyKey}`,
        };
      },
    );

    const handler = createPostPaymentIntentHandler({
      paymentIntentService,
      now: () => new Date("2026-03-01T15:01:00Z"),
    });

    const first = await parseResponse(
      await handler(buildPaymentIntentRequest(invoiceId, "payment-idem-1"), invoiceId),
    );
    const second = await parseResponse(
      await handler(buildPaymentIntentRequest(invoiceId, "payment-idem-1"), invoiceId),
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.invoice_id, second.body.invoice_id);
    assert.equal(first.body.payment_id, second.body.payment_id);
    assert.equal(first.body.stripe_payment_intent_id, second.body.stripe_payment_intent_id);
    assert.equal(second.body.replayed, true);
    assert.equal(gatewayCalls, 1);

    const paymentCount = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM payments WHERE invoice_id = $1 AND idempotency_key = $2",
      [invoiceId, "payment-idem-1"],
    );

    assert.equal(paymentCount.rows[0].count, 1);
  });
});

test("duplicate webhook delivery is a safe no-op", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-block5-dup",
      state: "ENDED",
      currentPrice: 200,
      winnerCompanyId: "company-dup-1",
      closedAt: "2026-03-01T16:00:00Z",
    });

    await insertWallet(db, "company-dup-1", { available: 800, locked: 200 });
    await insertActiveDepositLock(db, {
      id: "lock-dup-1",
      auctionId: "auction-block5-dup",
      companyId: "company-dup-1",
      walletId: "wallet-company-dup-1",
      amount: 200,
    });

    const { invoiceId } = await createFinalizedInvoice(db, {
      auctionId: "auction-block5-dup",
      winnerCompanyId: "company-dup-1",
      closedAt: new Date("2026-03-01T16:00:00Z"),
    });

    const paymentIntentService = createPaymentIntentService(
      createPgliteTransactionRunner(db),
      async () => ({
        stripePaymentIntentId: "pi_dup_1",
        clientSecret: "secret_dup_1",
      }),
    );

    await paymentIntentService.createInvoicePaymentIntent({
      invoiceId,
      idempotencyKey: "payment-intent-dup-1",
      occurredAt: new Date("2026-03-01T16:01:00Z"),
    });

    const handler = createPostStripeWebhookHandler({
      stripeWebhookService: createStripeWebhookService(createPgliteTransactionRunner(db)),
      verifyStripeSignatureFn: () => true,
      now: () => new Date("2026-03-01T16:02:00Z"),
    });

    const payload = {
      id: "evt_dup_1",
      type: "payment_intent.succeeded",
      created: 1_772_337_720,
      data: {
        object: {
          id: "pi_dup_1",
          latest_charge: "ch_dup_1",
        },
      },
    };

    const first = await parseResponse(await handler(buildWebhookRequest(payload)));
    const second = await parseResponse(await handler(buildWebhookRequest(payload)));

    assert.equal(first.status, 200);
    assert.equal(first.body.result, "applied");
    assert.equal(second.status, 200);
    assert.equal(second.body.result, "noop");
    assert.equal(second.body.reason, "duplicate_event");

    const dedupeRows = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM payment_webhook_events WHERE stripe_event_id = $1",
      ["evt_dup_1"],
    );

    assert.equal(dedupeRows.rows[0].count, 1);
  });
});

test("out-of-order success webhook is no-op when invoice is not ISSUED", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-block5-ignored",
      state: "ENDED",
      currentPrice: 150,
      winnerCompanyId: "company-ignored-1",
      closedAt: "2026-03-01T17:00:00Z",
    });

    await insertWallet(db, "company-ignored-1", { available: 900, locked: 150 });
    await insertActiveDepositLock(db, {
      id: "lock-ignored-1",
      auctionId: "auction-block5-ignored",
      companyId: "company-ignored-1",
      walletId: "wallet-company-ignored-1",
      amount: 150,
    });

    const { invoiceId } = await createFinalizedInvoice(db, {
      auctionId: "auction-block5-ignored",
      winnerCompanyId: "company-ignored-1",
      closedAt: new Date("2026-03-01T17:00:00Z"),
    });

    const paymentIntentService = createPaymentIntentService(
      createPgliteTransactionRunner(db),
      async () => ({
        stripePaymentIntentId: "pi_ignored_1",
        clientSecret: "secret_ignored_1",
      }),
    );

    await paymentIntentService.createInvoicePaymentIntent({
      invoiceId,
      idempotencyKey: "payment-intent-ignored-1",
      occurredAt: new Date("2026-03-01T17:01:00Z"),
    });

    await db.query(
      `UPDATE invoices
       SET status = 'DEFAULTED',
           updated_at = $2::timestamptz
       WHERE id = $1`,
      [invoiceId, "2026-03-01T17:05:00Z"],
    );

    const handler = createPostStripeWebhookHandler({
      stripeWebhookService: createStripeWebhookService(createPgliteTransactionRunner(db)),
      verifyStripeSignatureFn: () => true,
      now: () => new Date("2026-03-01T17:06:00Z"),
    });

    const response = await parseResponse(
      await handler(
        buildWebhookRequest({
          id: "evt_ignored_1",
          type: "payment_intent.succeeded",
          created: 1_772_341_560,
          data: {
            object: {
              id: "pi_ignored_1",
              latest_charge: "ch_ignored_1",
            },
          },
        }),
      ),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result, "noop");
    assert.equal(response.body.reason, "invoice_not_issued");

    const paymentStatusRow = await db.query<{ status: string }>(
      "SELECT status FROM payments WHERE stripe_payment_intent_id = $1",
      ["pi_ignored_1"],
    );

    assert.equal(paymentStatusRow.rows[0].status, "PENDING");

    const webhookEventRows = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM payment_webhook_events WHERE stripe_event_id = $1",
      ["evt_ignored_1"],
    );

    assert.equal(webhookEventRows.rows[0].count, 1);
  });
});

test("successful webhook applies payment, deadline, auction and deposit mutations exactly once", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-block5-success",
      state: "ENDED",
      currentPrice: 220,
      winnerCompanyId: "company-success-1",
      closedAt: "2026-03-01T18:00:00Z",
    });

    await insertWallet(db, "company-success-1", { available: 780, locked: 220 });
    await insertActiveDepositLock(db, {
      id: "lock-success-1",
      auctionId: "auction-block5-success",
      companyId: "company-success-1",
      walletId: "wallet-company-success-1",
      amount: 220,
    });

    const { invoiceId } = await createFinalizedInvoice(db, {
      auctionId: "auction-block5-success",
      winnerCompanyId: "company-success-1",
      closedAt: new Date("2026-03-01T18:00:00Z"),
    });

    const paymentIntentService = createPaymentIntentService(
      createPgliteTransactionRunner(db),
      async () => ({
        stripePaymentIntentId: "pi_success_1",
        clientSecret: "secret_success_1",
      }),
    );

    const paymentIntent = await paymentIntentService.createInvoicePaymentIntent({
      invoiceId,
      idempotencyKey: "payment-intent-success-1",
      occurredAt: new Date("2026-03-01T18:01:00Z"),
    });

    const handler = createPostStripeWebhookHandler({
      stripeWebhookService: createStripeWebhookService(createPgliteTransactionRunner(db)),
      verifyStripeSignatureFn: () => true,
      now: () => new Date("2026-03-01T18:02:00Z"),
    });

    const first = await parseResponse(
      await handler(
        buildWebhookRequest({
          id: "evt_success_1",
          type: "payment_intent.succeeded",
          created: 1_772_345_120,
          data: {
            object: {
              id: paymentIntent.stripePaymentIntentId,
              latest_charge: "ch_success_1",
            },
          },
        }),
      ),
    );

    const second = await parseResponse(
      await handler(
        buildWebhookRequest({
          id: "evt_success_2",
          type: "payment_intent.succeeded",
          created: 1_772_345_180,
          data: {
            object: {
              id: paymentIntent.stripePaymentIntentId,
              latest_charge: "ch_success_2",
            },
          },
        }),
      ),
    );

    assert.equal(first.status, 200);
    assert.equal(first.body.result, "applied");
    assert.equal(second.status, 200);
    assert.equal(second.body.result, "noop");
    assert.equal(second.body.reason, "invoice_not_issued");

    const paymentRow = await db.query<{ status: string; stripe_charge_id: string }>(
      "SELECT status, stripe_charge_id FROM payments WHERE id = $1",
      [paymentIntent.paymentId],
    );
    assert.equal(paymentRow.rows[0].status, "SUCCEEDED");
    assert.equal(paymentRow.rows[0].stripe_charge_id, "ch_success_1");

    const invoiceRow = await db.query<{ status: string; paid_at: string | null }>(
      "SELECT status, paid_at FROM invoices WHERE id = $1",
      [invoiceId],
    );
    assert.equal(invoiceRow.rows[0].status, "PAID");
    assert.ok(invoiceRow.rows[0].paid_at);

    const deadlineRow = await db.query<{ status: string; resolved_at: string | null }>(
      "SELECT status, resolved_at FROM payment_deadlines WHERE auction_id = $1",
      ["auction-block5-success"],
    );
    assert.equal(deadlineRow.rows[0].status, "PAID");
    assert.ok(deadlineRow.rows[0].resolved_at);

    const auctionRow = await db.query<{ state: string }>(
      "SELECT state FROM auctions WHERE id = $1",
      ["auction-block5-success"],
    );
    assert.equal(auctionRow.rows[0].state, "PAID");

    const lockRow = await db.query<{ status: string }>(
      "SELECT status FROM deposit_locks WHERE id = $1",
      ["lock-success-1"],
    );
    assert.equal(lockRow.rows[0].status, "RELEASED");

    const walletRow = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["company-success-1"],
    );
    assert.equal(Number(walletRow.rows[0].balance), 1000);
    assert.equal(Number(walletRow.rows[0].lockedBalance), 0);

    const transitionCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auction_state_transitions
       WHERE auction_id = $1
         AND from_state = 'PAYMENT_PENDING'
         AND to_state = 'PAID'`,
      ["auction-block5-success"],
    );
    assert.equal(transitionCount.rows[0].count, 1);

    const financialEventCount = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM financial_events
       WHERE auction_id = $1
         AND event_type IN ('PAYMENT_SUCCEEDED', 'DEPOSIT_RELEASE')`,
      ["auction-block5-success"],
    );
    assert.equal(financialEventCount.rows[0].count, 2);

    const walletLedgerRows = await db.query<{ type: string; amount: number; reference: string | null }>(
      `SELECT type, amount, reference
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-company-success-1"],
    );

    assert.equal(walletLedgerRows.rows.length, 1);
    assert.equal(walletLedgerRows.rows[0].type, "PAYMENT_RECEIVED");
    assert.equal(Number(walletLedgerRows.rows[0].amount), 220);
    assert.equal(walletLedgerRows.rows[0].reference, invoiceId);
  });
});
