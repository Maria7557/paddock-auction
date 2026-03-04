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

type WalletRow = SqlRow & {
  id: unknown;
  currency: unknown;
};

type DepositLockRow = SqlRow & {
  id: unknown;
  amount: unknown;
};

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  version: unknown;
};

type InsertRow = SqlRow & { id: unknown };

type UpdatedWalletRow = SqlRow & {
  id: unknown;
};

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

        const walletResult = await tx.query<WalletRow>(
          `SELECT
             id,
             currency
           FROM deposit_wallets
           WHERE company_id = $1
             AND currency = $2
           FOR UPDATE`,
          [buyerCompanyId, String(invoice.currency)],
        );

        if (walletResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "buyer_wallet_not_found",
          };
        }

        const wallet = walletResult.rows[0];
        const walletId = String(wallet.id);

        const lockResult = await tx.query<DepositLockRow>(
          `SELECT
             id,
             amount
           FROM deposit_locks
           WHERE auction_id = $1
             AND company_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [auctionId, buyerCompanyId],
        );

        if (lockResult.rows.length === 0) {
          return {
            kind: "ignored",
            reason: "winner_deposit_lock_not_found",
          };
        }

        const depositLock = lockResult.rows[0];
        const depositLockId = String(depositLock.id);
        const depositAmount = toNumber(depositLock.amount, "amount");

        const auctionResult = await tx.query<AuctionRow>(
          `SELECT
             id,
             state,
             version
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

        const walletUpdateResult = await tx.query<UpdatedWalletRow>(
          `UPDATE deposit_wallets
           SET available_balance = available_balance + $2,
               locked_balance = locked_balance - $2,
               updated_at = $3::timestamptz
           WHERE id = $1
             AND locked_balance >= $2
           RETURNING id`,
          [walletId, depositAmount, input.occurredAt.toISOString()],
        );

        if (walletUpdateResult.rows.length === 0) {
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
            toNumber(invoice.total, "total"),
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
            String(wallet.currency),
            JSON.stringify({
              stripe_event_id: input.stripeEventId,
              lock_resolution: "RELEASED",
            }),
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
