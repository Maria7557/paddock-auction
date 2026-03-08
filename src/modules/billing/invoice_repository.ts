import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../lib/domain_errors";
import type { SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import { toNumber } from "../../lib/sql_contract";

export const INVOICE_AUCTION_NOT_FOUND_CODE = "INVOICE_AUCTION_NOT_FOUND";
export const INVOICE_WINNING_BID_NOT_FOUND_CODE = "INVOICE_WINNING_BID_NOT_FOUND";

type AuctionRow = SqlRow & {
  id: unknown;
  seller_company_id: unknown;
  highest_bid_id: unknown;
  ends_at: unknown;
  closed_at: unknown;
};

type BidRow = SqlRow & {
  id: unknown;
  company_id: unknown;
  amount: unknown;
};

type InvoiceRow = SqlRow & {
  id: unknown;
  auction_id: unknown;
  buyer_company_id: unknown;
  total: unknown;
  status: unknown;
  created_at: unknown;
  due_at: unknown;
};

export type InvoiceStatus = "PENDING" | "PAID" | "EXPIRED";

export type WinnerInvoice = {
  id: string;
  auctionId: string;
  buyerId: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: Date;
  paymentDeadline: Date;
};

export type InvoiceRepository = {
  createInvoiceForWinner(auctionId: string): Promise<WinnerInvoice>;
};

function toNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Field ${fieldName} must be a non-empty string. Received: ${String(value)}`);
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

function addHours(base: Date, hours: number): Date {
  const dueAt = new Date(base);
  dueAt.setUTCHours(dueAt.getUTCHours() + hours);
  return dueAt;
}

function mapInvoiceStatus(dbStatus: string): InvoiceStatus {
  if (dbStatus === "PAID") {
    return "PAID";
  }

  if (dbStatus === "DEFAULTED" || dbStatus === "CANCELED") {
    return "EXPIRED";
  }

  return "PENDING";
}

function mapInvoiceRow(row: InvoiceRow): WinnerInvoice {
  return {
    id: toNonEmptyString(row.id, "invoices.id"),
    auctionId: toNonEmptyString(row.auction_id, "invoices.auction_id"),
    buyerId: toNonEmptyString(row.buyer_company_id, "invoices.buyer_company_id"),
    amount: toNumber(row.total, "invoices.total"),
    status: mapInvoiceStatus(String(row.status)),
    createdAt: toDate(row.created_at, "invoices.created_at"),
    paymentDeadline: toDate(row.due_at, "invoices.due_at"),
  };
}

export function createInvoiceRepository(
  transactionRunner: SqlTransactionRunner,
): InvoiceRepository {
  return {
    async createInvoiceForWinner(auctionId: string): Promise<WinnerInvoice> {
      return transactionRunner.transaction(async (tx) => {
        const auctionResult = await tx.query<AuctionRow>(
          `SELECT
             id,
             seller_company_id,
             highest_bid_id,
             ends_at,
             closed_at
           FROM auctions
           WHERE id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (auctionResult.rows.length === 0) {
          throw new DomainNotFoundError(
            INVOICE_AUCTION_NOT_FOUND_CODE,
            `Auction ${auctionId} was not found`,
          );
        }

        const auction = auctionResult.rows[0];
        const winningBidId =
          auction.highest_bid_id === null || auction.highest_bid_id === undefined
            ? null
            : toNonEmptyString(auction.highest_bid_id, "auctions.highest_bid_id");

        if (winningBidId === null) {
          throw new DomainConflictError(
            INVOICE_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid was not found for auction ${auctionId}`,
          );
        }

        const winningBidResult = await tx.query<BidRow>(
          `SELECT id, company_id, amount
           FROM bids
           WHERE id = $1
             AND auction_id = $2
           FOR UPDATE`,
          [winningBidId, auctionId],
        );

        if (winningBidResult.rows.length === 0) {
          throw new DomainNotFoundError(
            INVOICE_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid ${winningBidId} was not found for auction ${auctionId}`,
          );
        }

        const winningBid = winningBidResult.rows[0];
        const buyerCompanyId = toNonEmptyString(winningBid.company_id, "bids.company_id");
        const winningAmount = toNumber(winningBid.amount, "bids.amount");

        const auctionEndAt =
          auction.closed_at === null || auction.closed_at === undefined
            ? toDate(auction.ends_at, "auctions.ends_at")
            : toDate(auction.closed_at, "auctions.closed_at");
        const paymentDeadline = addHours(auctionEndAt, 48);

        const existingInvoiceResult = await tx.query<InvoiceRow>(
          `SELECT
             id,
             auction_id,
             buyer_company_id,
             total,
             status,
             created_at,
             due_at
           FROM invoices
           WHERE auction_id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (existingInvoiceResult.rows.length > 0) {
          return mapInvoiceRow(existingInvoiceResult.rows[0]);
        }

        const createdAt = new Date();
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
           RETURNING
             id,
             auction_id,
             buyer_company_id,
             total,
             status,
             created_at,
             due_at`,
          [
            randomUUID(),
            auctionId,
            buyerCompanyId,
            toNonEmptyString(auction.seller_company_id, "auctions.seller_company_id"),
            winningAmount,
            createdAt.toISOString(),
            paymentDeadline.toISOString(),
          ],
        );

        return mapInvoiceRow(invoiceInsertResult.rows[0]);
      });
    },
  };
}
