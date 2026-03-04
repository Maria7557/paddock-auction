import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../../lib/domain_errors";
import type { SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";
import {
  assertAuctionTransitionAllowed,
  normalizeAuctionState,
} from "../../auction/domain/auction_state_machine";
import { billingErrorCodes } from "../domain/billing_error_codes";

export type FinalizeAuctionWinnerInput = {
  auctionId: string;
  winnerCompanyId: string;
  occurredAt: Date;
  actorId?: string;
  trigger?: string;
};

export type FinalizeAuctionWinnerResult = {
  auctionId: string;
  invoiceId: string;
  paymentDeadlineId: string;
  dueAt: Date;
  transitionId: string | null;
  invoiceCreated: boolean;
  paymentDeadlineCreated: boolean;
};

export type WinnerFinalizationRepository = {
  finalizeAuctionWinner(input: FinalizeAuctionWinnerInput): Promise<FinalizeAuctionWinnerResult>;
};

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  version: unknown;
  current_price: unknown;
  seller_company_id: unknown;
  winner_company_id: unknown;
  closed_at: unknown;
};

type InvoiceRow = SqlRow & {
  id: unknown;
  due_at: unknown;
};

type PaymentDeadlineRow = SqlRow & {
  id: unknown;
  due_at: unknown;
};

function computeDueAt(closedAt: Date): Date {
  const dueAt = new Date(closedAt);
  dueAt.setUTCHours(dueAt.getUTCHours() + 48);
  return dueAt;
}

function toDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new Error(`Field ${fieldName} must be a valid date. Received: ${String(value)}`);
}

export function createWinnerFinalizationRepository(
  transactionRunner: SqlTransactionRunner,
): WinnerFinalizationRepository {
  return {
    async finalizeAuctionWinner(input: FinalizeAuctionWinnerInput): Promise<FinalizeAuctionWinnerResult> {
      return transactionRunner.transaction(async (tx) => {
        const auctionResult = await tx.query<AuctionRow>(
          `SELECT
             id,
             state,
             version,
             current_price,
             seller_company_id,
             winner_company_id,
             closed_at
           FROM auctions
           WHERE id = $1
           FOR UPDATE`,
          [input.auctionId],
        );

        if (auctionResult.rows.length === 0) {
          throw new DomainNotFoundError(
            billingErrorCodes.invoiceNotFound,
            `Auction ${input.auctionId} was not found`,
          );
        }

        const auction = auctionResult.rows[0];
        const currentState = normalizeAuctionState(String(auction.state));
        const currentVersion = toNumber(auction.version, "version");
        const winnerCompanyId =
          auction.winner_company_id === null || auction.winner_company_id === undefined
            ? null
            : String(auction.winner_company_id);

        if (winnerCompanyId !== null && winnerCompanyId !== input.winnerCompanyId) {
          throw new DomainConflictError(
            billingErrorCodes.auctionWinnerMismatch,
            `Auction ${input.auctionId} already has winner ${winnerCompanyId}`,
          );
        }

        if (currentState !== "ENDED" && currentState !== "PAYMENT_PENDING") {
          throw new DomainConflictError(
            billingErrorCodes.auctionNotReadyForFinalization,
            `Auction ${input.auctionId} must be ENDED or PAYMENT_PENDING to finalize winner`,
          );
        }

        const closedAt =
          auction.closed_at === null || auction.closed_at === undefined
            ? input.occurredAt
            : toDate(auction.closed_at, "closed_at");
        const dueAt = computeDueAt(closedAt);

        const existingInvoiceResult = await tx.query<InvoiceRow>(
          `SELECT id, due_at
           FROM invoices
           WHERE auction_id = $1
           FOR UPDATE`,
          [input.auctionId],
        );

        let invoiceId: string;
        let invoiceCreated = false;

        if (existingInvoiceResult.rows.length > 0) {
          invoiceId = String(existingInvoiceResult.rows[0].id);
        } else {
          const invoiceInsertResult = await tx.query<InvoiceRow>(
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
             ) VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'USD', 'ISSUED', $6::timestamptz, $7::timestamptz, $6::timestamptz, $6::timestamptz)
             RETURNING id, due_at`,
            [
              randomUUID(),
              input.auctionId,
              input.winnerCompanyId,
              String(auction.seller_company_id),
              toNumber(auction.current_price, "current_price"),
              input.occurredAt.toISOString(),
              dueAt.toISOString(),
            ],
          );

          invoiceId = String(invoiceInsertResult.rows[0].id);
          invoiceCreated = true;
        }

        const existingDeadlineResult = await tx.query<PaymentDeadlineRow>(
          `SELECT id, due_at
           FROM payment_deadlines
           WHERE auction_id = $1
             AND buyer_company_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [input.auctionId, input.winnerCompanyId],
        );

        let paymentDeadlineId: string;
        let paymentDeadlineCreated = false;

        if (existingDeadlineResult.rows.length > 0) {
          paymentDeadlineId = String(existingDeadlineResult.rows[0].id);
        } else {
          const deadlineInsertResult = await tx.query<PaymentDeadlineRow>(
            `INSERT INTO payment_deadlines (
               id,
               auction_id,
               buyer_company_id,
               due_at,
               status,
               escalated_flag,
               created_at
             ) VALUES ($1, $2, $3, $4::timestamptz, 'ACTIVE', false, $5::timestamptz)
             RETURNING id, due_at`,
            [
              randomUUID(),
              input.auctionId,
              input.winnerCompanyId,
              dueAt.toISOString(),
              input.occurredAt.toISOString(),
            ],
          );

          paymentDeadlineId = String(deadlineInsertResult.rows[0].id);
          paymentDeadlineCreated = true;
        }

        let transitionId: string | null = null;

        if (currentState === "ENDED") {
          assertAuctionTransitionAllowed("ENDED", "PAYMENT_PENDING");
          transitionId = randomUUID();

          await tx.query(
            `UPDATE auctions
             SET state = 'PAYMENT_PENDING',
                 winner_company_id = $2,
                 closed_at = $3::timestamptz,
                 version = $4,
                 updated_at = $5::timestamptz
             WHERE id = $1`,
            [
              input.auctionId,
              input.winnerCompanyId,
              closedAt.toISOString(),
              currentVersion + 1,
              input.occurredAt.toISOString(),
            ],
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
             ) VALUES ($1, $2, 'ENDED', 'PAYMENT_PENDING', $3, $4, $5, $6::timestamptz)`,
            [
              transitionId,
              input.auctionId,
              input.trigger ?? "winner_finalization",
              "Winner finalized for payment",
              input.actorId ?? null,
              input.occurredAt.toISOString(),
            ],
          );
        } else {
          await tx.query(
            `UPDATE auctions
             SET winner_company_id = COALESCE(winner_company_id, $2),
                 closed_at = COALESCE(closed_at, $3::timestamptz),
                 updated_at = $4::timestamptz
             WHERE id = $1`,
            [
              input.auctionId,
              input.winnerCompanyId,
              closedAt.toISOString(),
              input.occurredAt.toISOString(),
            ],
          );
        }

        return {
          auctionId: input.auctionId,
          invoiceId,
          paymentDeadlineId,
          dueAt,
          transitionId,
          invoiceCreated,
          paymentDeadlineCreated,
        };
      });
    },
  };
}
