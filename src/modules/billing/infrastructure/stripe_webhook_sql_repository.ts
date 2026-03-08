import { randomUUID } from "node:crypto";

import type { SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";
import {
  assertAuctionTransitionAllowed,
  normalizeAuctionState,
} from "../../auction/domain/auction_state_machine";

export type StripeWebhookProcessInput = {
  stripeEventId: string;
  eventType: string;
  payloadHash: string;
  paymentIntentId: string | null;
  stripeChargeId: string | null;
  occurredAt: Date;
  eventPayload: Record<string, unknown>;
};

export type StripeWebhookProcessResult =
  | {
      kind: "duplicate";
    }
  | {
      kind: "ignored";
      reason:
        | "unsupported_event_type"
        | "missing_payment_intent_id"
        | "payment_not_found"
        | "invoice_not_found"
        | "invoice_not_issued"
        | "payment_deadline_not_active"
        | "buyer_wallet_not_found"
        | "winner_deposit_lock_not_found"
        | "auction_not_found"
        | "auction_not_payment_pending"
        | "wallet_locked_balance_insufficient";
    }
  | {
      kind: "applied";
      auctionId: string;
      invoiceId: string;
      paymentId: string;
      depositLockId: string;
      transitionId: string;
    };

export type StripeWebhookRepository = {
  processStripeWebhook(input: StripeWebhookProcessInput): Promise<StripeWebhookProcessResult>;
};

type PaymentRow = SqlRow & {
  id: unknown;
  invoice_id: unknown;
  status: unknown;
  stripe_payment_intent_id: unknown;
};

type InvoiceRow = SqlRow & {
  id: unknown;
  auction_id: unknown;
  buyer_company_id: unknown;
  status: unknown;
  total: unknown;
  currency: unknown;
};

type PaymentDeadlineRow = SqlRow & {
  id: unknown;
};

type UserWalletRow = SqlRow & {
  id: unknown;
};

type BidRow = SqlRow & {
  user_id: unknown;
  company_id: unknown;
};

type DepositLockRow = SqlRow & {
  id: unknown;
  wallet_id: unknown;
  amount: unknown;
};

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  version: unknown;
  highest_bid_id: unknown;
};

type InsertRow = SqlRow & { id: unknown };

type UpdatedWalletRow = SqlRow & {
  id: unknown;
};

function toIntegerAmount(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Field ${fieldName} must be an integer amount for wallet ledger operations`);
  }

  return value;
}

async function ensureUserWallet(
  tx: {
    query<T extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  },
  userId: string,
): Promise<string> {
  const existingWalletResult = await tx.query<UserWalletRow>(
    `SELECT id
     FROM "Wallet"
     WHERE "userId" = $1
     FOR UPDATE`,
    [userId],
  );

  if (existingWalletResult.rows.length > 0) {
    return String(existingWalletResult.rows[0].id);
  }

  await tx.query(
    `INSERT INTO "User" (id, email)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@wallet.local`],
  );

  const walletId = randomUUID();
  const insertedWalletResult = await tx.query<UserWalletRow>(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance",
       "createdAt"
     ) VALUES ($1, $2, 0, 0, CURRENT_TIMESTAMP)
     ON CONFLICT ("userId") DO NOTHING
     RETURNING id`,
    [walletId, userId],
  );

  if (insertedWalletResult.rows.length > 0) {
    return String(insertedWalletResult.rows[0].id);
  }

  const reloadedWalletResult = await tx.query<UserWalletRow>(
    `SELECT id
     FROM "Wallet"
     WHERE "userId" = $1
     FOR UPDATE`,
    [userId],
  );

  if (reloadedWalletResult.rows.length === 0) {
    throw new Error(`Wallet could not be created or loaded for user ${userId}`);
  }

  return String(reloadedWalletResult.rows[0].id);
}

export function createStripeWebhookRepository(
  transactionRunner: SqlTransactionRunner,
): StripeWebhookRepository {
  return {
    async processStripeWebhook(input: StripeWebhookProcessInput): Promise<StripeWebhookProcessResult> {
      return transactionRunner.transaction(async (tx) => {
        const webhookInsertResult = await tx.query<InsertRow>(
          `INSERT INTO payment_webhook_events (
             id,
             stripe_event_id,
             event_type,
             payload_hash,
             status,
             processed_at,
             created_at
           ) VALUES ($1, $2, $3, $4, $5::"PaymentWebhookEventStatus", $6::timestamptz, $6::timestamptz)
           ON CONFLICT (stripe_event_id) DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            input.stripeEventId,
            input.eventType,
            input.payloadHash,
            input.eventType === "payment_intent.succeeded" ? "PROCESSED" : "IGNORED",
            input.occurredAt.toISOString(),
          ],
        );

        if (webhookInsertResult.rows.length === 0) {
          return {
            kind: "duplicate",
          };
        }

        if (input.eventType !== "payment_intent.succeeded") {
          return {
            kind: "ignored",
            reason: "unsupported_event_type",
          };
        }

        if (!input.paymentIntentId) {
          return {
            kind: "ignored",
            reason: "missing_payment_intent_id",
          };
        }

        const paymentResult = await tx.query<PaymentRow>(
          `SELECT
             id,
             invoice_id,
             status,
             stripe_payment_intent_id
           FROM payments
           WHERE stripe_payment_intent_id = $1
           FOR UPDATE`,
          [input.paymentIntentId],
        );

        if (paymentResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "payment_not_found",
          };
        }

        const payment = paymentResult.rows[0];
        const paymentId = String(payment.id);
        const invoiceId = String(payment.invoice_id);

        const invoiceResult = await tx.query<InvoiceRow>(
          `SELECT
             id,
             auction_id,
             buyer_company_id,
             status,
             total,
             currency
           FROM invoices
           WHERE id = $1
           FOR UPDATE`,
          [invoiceId],
        );

        if (invoiceResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "invoice_not_found",
          };
        }

        const invoice = invoiceResult.rows[0];

        if (String(invoice.status) !== "ISSUED") {
          return {
            kind: "ignored",
            reason: "invoice_not_issued",
          };
        }

        const auctionId = String(invoice.auction_id);
        const buyerCompanyId = String(invoice.buyer_company_id);
        const invoiceTotalAmount = toIntegerAmount(toNumber(invoice.total, "total"), "invoice.total");

        const deadlineResult = await tx.query<PaymentDeadlineRow>(
          `SELECT id
           FROM payment_deadlines
           WHERE auction_id = $1
             AND buyer_company_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [auctionId, buyerCompanyId],
        );

        if (deadlineResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "payment_deadline_not_active",
          };
        }

        const paymentDeadlineId = String(deadlineResult.rows[0].id);

        const auctionResult = await tx.query<AuctionRow>(
          `SELECT
             id,
             state,
             version,
             highest_bid_id
           FROM auctions
           WHERE id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (auctionResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "auction_not_found",
          };
        }

        const auction = auctionResult.rows[0];
        const auctionState = normalizeAuctionState(String(auction.state));

        if (auctionState !== "PAYMENT_PENDING") {
          return {
            kind: "ignored",
            reason: "auction_not_payment_pending",
          };
        }

        assertAuctionTransitionAllowed("PAYMENT_PENDING", "PAID");

        let winnerWalletId: string | null = null;
        const highestBidId =
          auction.highest_bid_id === null || auction.highest_bid_id === undefined
            ? null
            : String(auction.highest_bid_id);

        if (highestBidId !== null) {
          const winningBidResult = await tx.query<BidRow>(
            `SELECT user_id, company_id
             FROM bids
             WHERE id = $1
               AND auction_id = $2
             FOR UPDATE`,
            [highestBidId, auctionId],
          );

          if (winningBidResult.rows.length > 0) {
            const winningBid = winningBidResult.rows[0];
            const winningCompanyId = String(winningBid.company_id);

            if (winningCompanyId !== buyerCompanyId) {
              return {
                kind: "ignored",
                reason: "winner_deposit_lock_not_found",
              };
            }

            const winningUserId = String(winningBid.user_id);
            const winningWalletResult = await tx.query<UserWalletRow>(
              `SELECT id
               FROM "Wallet"
               WHERE "userId" = $1
               FOR UPDATE`,
              [winningUserId],
            );

            if (winningWalletResult.rows.length > 0) {
              winnerWalletId = String(winningWalletResult.rows[0].id);
            }
          }
        }

        if (winnerWalletId === null) {
          const fallbackWalletResult = await tx.query<UserWalletRow>(
            `SELECT id
             FROM "Wallet"
             WHERE "userId" = $1
             FOR UPDATE`,
            [buyerCompanyId],
          );

          if (fallbackWalletResult.rows.length > 0) {
            winnerWalletId = String(fallbackWalletResult.rows[0].id);
          }
        }

        if (winnerWalletId === null) {
          return {
            kind: "ignored",
            reason: "winner_deposit_lock_not_found",
          };
        }

        const lockResult = await tx.query<DepositLockRow>(
          `SELECT
             id,
             wallet_id,
             amount
           FROM deposit_locks
           WHERE auction_id = $1
             AND wallet_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [auctionId, winnerWalletId],
        );

        if (lockResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "winner_deposit_lock_not_found",
          };
        }

        const depositLock = lockResult.rows[0];
        const depositLockId = String(depositLock.id);
        const depositAmount = toIntegerAmount(toNumber(depositLock.amount, "amount"), "deposit_lock.amount");

        const winnerWalletUpdateResult = await tx.query<UpdatedWalletRow>(
          `UPDATE "Wallet"
           SET balance = balance + $2,
               "lockedBalance" = "lockedBalance" - $2
           WHERE id = $1
             AND "lockedBalance" >= $2
           RETURNING id`,
          [winnerWalletId, depositAmount],
        );

        if (winnerWalletUpdateResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "wallet_locked_balance_insufficient",
          };
        }

        await tx.query(
          `UPDATE deposit_locks
           SET status = 'RELEASED',
               released_at = $2::timestamptz,
               resolution_reason = COALESCE(resolution_reason, 'PAYMENT_SUCCEEDED')
           WHERE id = $1`,
          [depositLockId, input.occurredAt.toISOString()],
        );

        await tx.query(
          `UPDATE payments
           SET status = 'SUCCEEDED',
               stripe_charge_id = COALESCE($2, stripe_charge_id),
               last_event_at = $3::timestamptz,
               updated_at = $3::timestamptz
           WHERE id = $1`,
          [paymentId, input.stripeChargeId, input.occurredAt.toISOString()],
        );

        await tx.query(
          `UPDATE invoices
           SET status = 'PAID',
               paid_at = $2::timestamptz,
               updated_at = $2::timestamptz
           WHERE id = $1`,
          [invoiceId, input.occurredAt.toISOString()],
        );

        await tx.query(
          `UPDATE payment_deadlines
           SET status = 'PAID',
               resolved_at = $2::timestamptz
           WHERE id = $1`,
          [paymentDeadlineId, input.occurredAt.toISOString()],
        );

        const nextAuctionVersion = toNumber(auction.version, "version") + 1;

        await tx.query(
          `UPDATE auctions
           SET state = 'PAID',
               version = $2,
               updated_at = $3::timestamptz
           WHERE id = $1`,
          [auctionId, nextAuctionVersion, input.occurredAt.toISOString()],
        );

        const transitionId = randomUUID();

        await tx.query(
          `INSERT INTO auction_state_transitions (
             id,
             auction_id,
             from_state,
             to_state,
             trigger,
             reason,
             actor_id,
             created_at
           ) VALUES ($1, $2, 'PAYMENT_PENDING', 'PAID', 'stripe_webhook', 'Stripe payment succeeded', NULL, $3::timestamptz)`,
          [transitionId, auctionId, input.occurredAt.toISOString()],
        );

        await tx.query(
          `INSERT INTO financial_events (
             id,
             event_type,
             source_type,
             source_id,
             auction_id,
             company_id,
             invoice_id,
             payment_id,
             amount,
             currency,
             payload,
             created_at
           ) VALUES ($1, 'PAYMENT_SUCCEEDED', 'payment', $2, $3, $4, $5, $2, $6, $7, $8::jsonb, $9::timestamptz)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            paymentId,
            auctionId,
            buyerCompanyId,
            invoiceId,
            invoiceTotalAmount,
            String(invoice.currency),
            JSON.stringify({
              stripe_event_id: input.stripeEventId,
              stripe_payment_intent_id: input.paymentIntentId,
              stripe_charge_id: input.stripeChargeId,
            }),
            input.occurredAt.toISOString(),
          ],
        );

        await tx.query(
          `INSERT INTO financial_events (
             id,
             event_type,
             source_type,
             source_id,
             auction_id,
             company_id,
             invoice_id,
             payment_id,
             amount,
             currency,
             payload,
             created_at
           ) VALUES ($1, 'DEPOSIT_RELEASE', 'deposit_lock', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
           ON CONFLICT (source_type, source_id) DO NOTHING`,
          [
            randomUUID(),
            depositLockId,
            auctionId,
            buyerCompanyId,
            invoiceId,
            paymentId,
            depositAmount,
            String(invoice.currency),
            JSON.stringify({
              stripe_event_id: input.stripeEventId,
              lock_resolution: "RELEASED",
            }),
            input.occurredAt.toISOString(),
          ],
        );

        const buyerUserWalletId = await ensureUserWallet(tx, buyerCompanyId);
        await tx.query(
          `INSERT INTO "WalletLedger" (
             id,
             "walletId",
             type,
             amount,
             reference,
             "createdAt"
           ) VALUES ($1, $2, $3::"LedgerType", $4, $5, $6::timestamptz)`,
          [
            randomUUID(),
            buyerUserWalletId,
            "PAYMENT_RECEIVED",
            invoiceTotalAmount,
            invoiceId,
            input.occurredAt.toISOString(),
          ],
        );

        return {
          kind: "applied",
          auctionId,
          invoiceId,
          paymentId,
          depositLockId,
          transitionId,
        };
      });
    },
  };
}
