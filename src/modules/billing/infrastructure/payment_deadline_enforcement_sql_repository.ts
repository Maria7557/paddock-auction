import { randomUUID } from "node:crypto";

import { DomainConflictError } from "../../../lib/domain_errors";
import type { SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";
import {
  assertAuctionTransitionAllowed,
  normalizeAuctionState,
} from "../../auction/domain/auction_state_machine";
import { billingErrorCodes } from "../domain/billing_error_codes";

const DEFAULT_DEADLINE_SELECT_LIMIT = 1;

type DueDeadlineRow = SqlRow & {
  id: unknown;
  auction_id: unknown;
  buyer_company_id: unknown;
};

type InvoiceRow = SqlRow & {
  id: unknown;
  status: unknown;
  total: unknown;
  currency: unknown;
};

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  version: unknown;
};

type DepositLockRow = SqlRow & {
  id: unknown;
  amount: unknown;
};

type WalletRow = SqlRow & {
  id: unknown;
  available_balance: unknown;
  locked_balance: unknown;
};

type UpdateRow = SqlRow & {
  id: unknown;
};

export type DeadlineProcessingResult = {
  deadlineId: string;
  auctionId: string;
  companyId: string;
  result: "defaulted" | "paid" | "noop";
  burnedLockId: string | null;
  defaulted: boolean;
};

export type PaymentDeadlineEnforcementRepository = {
  processNextDueDeadline(input: {
    occurredAt: Date;
  }): Promise<DeadlineProcessingResult | null>;
};

function toStringValue(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Field ${fieldName} must be a non-empty string. Received: ${String(value)}`);
}

export function createPaymentDeadlineEnforcementRepository(
  transactionRunner: SqlTransactionRunner,
): PaymentDeadlineEnforcementRepository {
  return {
    async processNextDueDeadline(input: { occurredAt: Date }): Promise<DeadlineProcessingResult | null> {
      return transactionRunner.transaction(async (tx) => {
        const dueDeadlineResult = await tx.query<DueDeadlineRow>(
          `SELECT
             id,
             auction_id,
             buyer_company_id
           FROM payment_deadlines
           WHERE status = 'ACTIVE'
             AND due_at <= $1::timestamptz
           ORDER BY due_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT ${DEFAULT_DEADLINE_SELECT_LIMIT}`,
          [input.occurredAt.toISOString()],
        );

        if (dueDeadlineResult.rows.length === 0) {
          return null;
        }

        const dueDeadline = dueDeadlineResult.rows[0];
        const deadlineId = toStringValue(dueDeadline.id, "id");
        const auctionId = toStringValue(dueDeadline.auction_id, "auction_id");
        const companyId = toStringValue(dueDeadline.buyer_company_id, "buyer_company_id");

        const invoiceResult = await tx.query<InvoiceRow>(
          `SELECT
             id,
             status,
             total,
             currency
           FROM invoices
           WHERE auction_id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (invoiceResult.rows.length === 0) {
          await tx.query(
            `UPDATE payment_deadlines
             SET status = 'DEFAULTED',
                 resolved_at = $2::timestamptz
             WHERE id = $1`,
            [deadlineId, input.occurredAt.toISOString()],
          );

          return {
            deadlineId,
            auctionId,
            companyId,
            result: "noop",
            burnedLockId: null,
            defaulted: false,
          };
        }

        const invoice = invoiceResult.rows[0];
        const invoiceId = toStringValue(invoice.id, "invoice.id");
        const invoiceStatus = toStringValue(invoice.status, "invoice.status");

        if (invoiceStatus === "PAID") {
          await tx.query(
            `UPDATE payment_deadlines
             SET status = 'PAID',
                 resolved_at = $2::timestamptz
             WHERE id = $1`,
            [deadlineId, input.occurredAt.toISOString()],
          );

          return {
            deadlineId,
            auctionId,
            companyId,
            result: "paid",
            burnedLockId: null,
            defaulted: false,
          };
        }

        if (invoiceStatus === "DEFAULTED") {
          await tx.query(
            `UPDATE payment_deadlines
             SET status = 'DEFAULTED',
                 resolved_at = COALESCE(resolved_at, $2::timestamptz)
             WHERE id = $1`,
            [deadlineId, input.occurredAt.toISOString()],
          );

          return {
            deadlineId,
            auctionId,
            companyId,
            result: "noop",
            burnedLockId: null,
            defaulted: false,
          };
        }

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
          throw new DomainConflictError(
            billingErrorCodes.invoiceNotFound,
            `Auction ${auctionId} was not found while enforcing deadline`,
          );
        }

        const auction = auctionResult.rows[0];
        const auctionState = normalizeAuctionState(toStringValue(auction.state, "auction.state"));
        const currentAuctionVersion = toNumber(auction.version, "auction.version");

        let transitionId: string | null = null;

        if (auctionState === "PAYMENT_PENDING") {
          assertAuctionTransitionAllowed("PAYMENT_PENDING", "DEFAULTED");
          transitionId = randomUUID();

          await tx.query(
            `UPDATE auctions
             SET state = 'DEFAULTED',
                 version = $2,
                 updated_at = $3::timestamptz
             WHERE id = $1`,
            [auctionId, currentAuctionVersion + 1, input.occurredAt.toISOString()],
          );

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
             ) VALUES ($1, $2, 'PAYMENT_PENDING', 'DEFAULTED', 'payment_deadline_enforcement', 'Payment deadline exceeded', NULL, $3::timestamptz)`,
            [transitionId, auctionId, input.occurredAt.toISOString()],
          );
        }

        const lockResult = await tx.query<DepositLockRow>(
          `SELECT
             id,
             amount
           FROM deposit_locks
           WHERE auction_id = $1
             AND company_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [auctionId, companyId],
        );

        let burnedLockId: string | null = null;

        if (lockResult.rows.length > 0) {
          const activeLock = lockResult.rows[0];
          burnedLockId = toStringValue(activeLock.id, "deposit_lock.id");
          const lockAmount = toNumber(activeLock.amount, "deposit_lock.amount");

          const walletResult = await tx.query<WalletRow>(
            `SELECT
               id,
               available_balance,
               locked_balance
             FROM deposit_wallets
             WHERE company_id = $1
               AND currency = $2
             FOR UPDATE`,
            [companyId, toStringValue(invoice.currency, "invoice.currency")],
          );

          if (walletResult.rows.length === 0) {
            throw new DomainConflictError(
              billingErrorCodes.invoiceNotFound,
              `Wallet for company ${companyId} was not found during deadline enforcement`,
            );
          }

          const wallet = walletResult.rows[0];
          const walletId = toStringValue(wallet.id, "wallet.id");

          const walletBurnResult = await tx.query<UpdateRow>(
            `UPDATE deposit_wallets
             SET locked_balance = locked_balance - $2,
                 updated_at = $3::timestamptz
             WHERE id = $1
               AND locked_balance >= $2
             RETURNING id`,
            [walletId, lockAmount, input.occurredAt.toISOString()],
          );

          if (walletBurnResult.rows.length === 0) {
            throw new DomainConflictError(
              billingErrorCodes.internalError,
              `Insufficient locked balance to burn winner deposit lock ${burnedLockId}`,
            );
          }

          await tx.query(
            `UPDATE deposit_locks
             SET status = 'BURNED',
                 burned_at = $2::timestamptz,
                 resolution_reason = COALESCE(resolution_reason, 'PAYMENT_DEFAULTED_DEADLINE')
             WHERE id = $1`,
            [burnedLockId, input.occurredAt.toISOString()],
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
               amount,
               currency,
               payload,
               created_at
             ) VALUES ($1, 'DEPOSIT_BURN', 'deposit_lock', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
             ON CONFLICT (source_type, source_id) DO NOTHING`,
            [
              randomUUID(),
              burnedLockId,
              auctionId,
              companyId,
              invoiceId,
              lockAmount,
              toStringValue(invoice.currency, "invoice.currency"),
              JSON.stringify({
                deadline_id: deadlineId,
                transition_id: transitionId,
              }),
              input.occurredAt.toISOString(),
            ],
          );
        }

        await tx.query(
          `UPDATE invoices
           SET status = 'DEFAULTED',
               updated_at = $2::timestamptz
           WHERE id = $1`,
          [invoiceId, input.occurredAt.toISOString()],
        );

        await tx.query(
          `UPDATE payment_deadlines
           SET status = 'DEFAULTED',
               resolved_at = $2::timestamptz
           WHERE id = $1`,
          [deadlineId, input.occurredAt.toISOString()],
        );

        return {
          deadlineId,
          auctionId,
          companyId,
          result: "defaulted",
          burnedLockId,
          defaulted: true,
        };
      });
    },
  };
}
