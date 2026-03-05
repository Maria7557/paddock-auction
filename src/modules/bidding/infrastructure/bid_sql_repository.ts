import { randomUUID } from "node:crypto";

import { BidContentionConflictError } from "../domain/bid_domain_errors";
import { bidErrorCodes, isExpectedBidContentionSqlState } from "../domain/bid_error_codes";
import type { SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";
import { lockDeposit } from "../../wallet/deposit_service";

type AuctionAndWalletRow = SqlRow & {
  auction_id: unknown;
  auction_state: unknown;
  auction_version: unknown;
  auction_current_price: unknown;
  auction_min_increment: unknown;
  auction_last_bid_sequence: unknown;
  wallet_id: unknown;
  wallet_available_balance: unknown;
};

type BidRequestRow = SqlRow & {
  request_hash: unknown;
  response_status: unknown;
  response_body: unknown;
};

type PersistedBidRequestResponseRow = SqlRow & {
  response_status: unknown;
  response_body: unknown;
};

type InsertedBidRequestRow = SqlRow & {
  id: unknown;
};

export type PlaceBidStorageInput = {
  auctionId: string;
  companyId: string;
  userId: string;
  amount: number;
  idempotencyKey: string;
  requestHash: string;
  occurredAt: Date;
};

export type BidPathTimingBreakdown = {
  advisoryLockWaitMs: number;
  dbTransactionMs: number;
  depositLockMs: number;
  walletUpdateMs: number;
  bidInsertMs: number;
  walletLockMutationMs: number;
  auctionUpdateMs: number;
  bidInsertAuctionUpdateMs: number;
};

type PlaceBidStorageResultTiming = {
  lockWaitMs: number;
  timing: BidPathTimingBreakdown;
};

export type PlaceBidStorageResult =
  | PlaceBidStorageResultTiming
  & {
      kind: "success";
      responseStatus: number;
      responseBody: Record<string, unknown>;
    }
  | PlaceBidStorageResultTiming
  & {
      kind: "replay";
      responseStatus: number;
      responseBody: Record<string, unknown>;
    }
  | PlaceBidStorageResultTiming
  & {
      kind: "idempotency_conflict";
    }
  | PlaceBidStorageResultTiming
  & {
      kind: "rejected";
      responseStatus: number;
      responseBody: Record<string, unknown>;
      errorCode: string;
    };

export type BidSqlRepository = {
  executePlaceBid(input: PlaceBidStorageInput): Promise<PlaceBidStorageResult>;
};

function extractSqlState(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }

  return null;
}

function computeBidRequestExpiry(occurredAt: Date): Date {
  const expiresAt = new Date(occurredAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 90);
  return expiresAt;
}

function parseStoredResponseBody(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function buildRejectedResponse(errorCode: string, message: string): Record<string, unknown> {
  return {
    error_code: errorCode,
    message,
  };
}

function createEmptyTimingBreakdown(): BidPathTimingBreakdown {
  return {
    advisoryLockWaitMs: 0,
    dbTransactionMs: 0,
    depositLockMs: 0,
    walletUpdateMs: 0,
    bidInsertMs: 0,
    walletLockMutationMs: 0,
    auctionUpdateMs: 0,
    bidInsertAuctionUpdateMs: 0,
  };
}

const FIRST_BID_DEPOSIT_LOCK_AMOUNT = 5000;

export function createBidSqlRepository(
  transactionRunner: SqlTransactionRunner,
  bidLockTimeoutMs: number,
): BidSqlRepository {
  return {
    async executePlaceBid(input: PlaceBidStorageInput): Promise<PlaceBidStorageResult> {
      return transactionRunner.transaction(async (tx) => {
        const txStartedAtMs = Date.now();
        const timing = createEmptyTimingBreakdown();
        let advisoryLockStartedAtMs = 0;

        try {
          await tx.query(`SET LOCAL lock_timeout = '${Math.max(1, Math.floor(bidLockTimeoutMs))}ms'`);
          const bidRequestId = randomUUID();
          const bidRequestExpiresAt = computeBidRequestExpiry(input.occurredAt);

          const insertedBidRequestResult = await tx.query<InsertedBidRequestRow>(
            `INSERT INTO bid_requests (
               id,
               auction_id,
               company_id,
               idempotency_key,
               request_hash,
               status,
               created_at,
               expires_at
             ) VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6::timestamptz, $7::timestamptz)
             ON CONFLICT (auction_id, company_id, idempotency_key) DO NOTHING
             RETURNING id`,
            [
              bidRequestId,
              input.auctionId,
              input.companyId,
              input.idempotencyKey,
              input.requestHash,
              input.occurredAt.toISOString(),
              bidRequestExpiresAt.toISOString(),
            ],
          );

          const finalizeTiming = (): BidPathTimingBreakdown => {
            timing.dbTransactionMs = Date.now() - txStartedAtMs;
            return { ...timing };
          };

          if (insertedBidRequestResult.rows.length === 0) {
            const existingBidRequestResult = await tx.query<BidRequestRow>(
              `SELECT request_hash, response_status, response_body
               FROM bid_requests
               WHERE auction_id = $1
                 AND company_id = $2
                 AND idempotency_key = $3`,
              [input.auctionId, input.companyId, input.idempotencyKey],
            );

            const existing = existingBidRequestResult.rows[0];

            if (!existing) {
              const responseBody = buildRejectedResponse(
                bidErrorCodes.idempotencyInProgress,
                "The same idempotency key is still in progress",
              );

              return {
                kind: "rejected",
                responseStatus: 409,
                responseBody,
                errorCode: bidErrorCodes.idempotencyInProgress,
                lockWaitMs: 0,
                timing: finalizeTiming(),
              };
            }

            const storedHash = String(existing.request_hash);

            if (storedHash !== input.requestHash) {
              return {
                kind: "idempotency_conflict",
                lockWaitMs: 0,
                timing: finalizeTiming(),
              };
            }

            const storedStatus =
              existing.response_status === null || existing.response_status === undefined
                ? null
                : toNumber(existing.response_status, "response_status");

            if (storedStatus !== null) {
              return {
                kind: "replay",
                responseStatus: storedStatus,
                responseBody: parseStoredResponseBody(existing.response_body),
                lockWaitMs: 0,
                timing: finalizeTiming(),
              };
            }

            return {
              kind: "rejected",
              responseStatus: 409,
              responseBody: buildRejectedResponse(
                bidErrorCodes.idempotencyInProgress,
                "The same idempotency key is still in progress",
              ),
              errorCode: bidErrorCodes.idempotencyInProgress,
              lockWaitMs: 0,
              timing: finalizeTiming(),
            };
          }

          advisoryLockStartedAtMs = Date.now();
          await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), 0)", [input.auctionId]);
          timing.advisoryLockWaitMs = Date.now() - advisoryLockStartedAtMs;

          const auctionResult = await tx.query<AuctionAndWalletRow>(
            `SELECT
               a.id AS auction_id,
               a.state AS auction_state,
               a.version AS auction_version,
               a.current_price AS auction_current_price,
               a.min_increment AS auction_min_increment,
               a.last_bid_sequence AS auction_last_bid_sequence,
               wallet.id AS wallet_id,
               wallet.available_balance AS wallet_available_balance
             FROM auctions AS a
             LEFT JOIN LATERAL (
               SELECT id, available_balance
               FROM deposit_wallets
               WHERE company_id = $2
                 AND currency = $3
               FOR UPDATE
             ) AS wallet ON TRUE
             WHERE a.id = $1
             FOR UPDATE OF a`,
            [input.auctionId, input.companyId, "USD"],
          );
          const lockWaitMs = timing.advisoryLockWaitMs;

          if (auctionResult.rows.length === 0) {
            return {
              kind: "rejected",
              responseStatus: 409,
              responseBody: buildRejectedResponse(
                bidErrorCodes.auctionNotLive,
                `Auction ${input.auctionId} was not found`,
              ),
              errorCode: bidErrorCodes.auctionNotLive,
              lockWaitMs,
              timing: finalizeTiming(),
            };
          }

          const auction = auctionResult.rows[0];
          const currentPrice = toNumber(auction.auction_current_price, "auction_current_price");
          const minIncrement = toNumber(auction.auction_min_increment, "auction_min_increment");
          const currentVersion = toNumber(auction.auction_version, "auction_version");
          const lastBidSequence = toNumber(auction.auction_last_bid_sequence, "auction_last_bid_sequence");

          const persistRejected = async (
            errorCode: string,
            message: string,
            responseStatus = 409,
          ): Promise<PlaceBidStorageResult> => {
            const responseBody = buildRejectedResponse(errorCode, message);

            await tx.query(
              `UPDATE bid_requests
               SET status = 'REJECTED',
                   response_status = $2,
                   response_body = $3::jsonb,
                   expires_at = $4::timestamptz
               WHERE id = $1`,
              [
                bidRequestId,
                responseStatus,
                JSON.stringify(responseBody),
                bidRequestExpiresAt.toISOString(),
              ],
            );

            return {
              kind: "rejected",
              responseStatus,
              responseBody,
              errorCode,
              lockWaitMs,
              timing: finalizeTiming(),
            };
          };

          if (String(auction.auction_state) !== "LIVE") {
            return persistRejected(
              bidErrorCodes.auctionNotLive,
              `Auction ${input.auctionId} is not live`,
            );
          }

          const minimumAcceptedAmount = Math.round((currentPrice + minIncrement) * 100) / 100;

          if (input.amount < minimumAcceptedAmount) {
            return persistRejected(
              bidErrorCodes.bidAmountTooLow,
              `Bid amount must be at least ${minimumAcceptedAmount.toFixed(2)}`,
            );
          }

          if (auction.wallet_id === null || auction.wallet_id === undefined) {
            return persistRejected(
              bidErrorCodes.depositRequired,
              `No deposit wallet found for company ${input.companyId}`,
            );
          }

          const walletId = String(auction.wallet_id);

          const depositLockStartedAtMs = Date.now();
          const lockDepositResult = await lockDeposit(
            tx,
            walletId,
            input.auctionId,
            FIRST_BID_DEPOSIT_LOCK_AMOUNT,
            input.companyId,
            input.occurredAt,
          );
          timing.depositLockMs += Date.now() - depositLockStartedAtMs;

          if (lockDepositResult.kind === "deposit_required") {
            return persistRejected(
              bidErrorCodes.depositRequired,
              `Insufficient available deposit. Minimum required: ${FIRST_BID_DEPOSIT_LOCK_AMOUNT.toFixed(2)}`,
            );
          }

          timing.walletLockMutationMs = timing.depositLockMs + timing.walletUpdateMs;

          const nextSequenceNo = lastBidSequence + 1;
          const bidId = randomUUID();
          const bidInsertStartedAtMs = Date.now();
          await tx.query(
            `INSERT INTO bids (
               id,
               auction_id,
               company_id,
               user_id,
               amount,
               sequence_no,
               created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
            `,
            [
              bidId,
              input.auctionId,
              input.companyId,
              input.userId,
              input.amount,
              nextSequenceNo,
              input.occurredAt.toISOString(),
            ],
          );
          timing.bidInsertMs = Date.now() - bidInsertStartedAtMs;

          const auctionUpdateStartedAtMs = Date.now();
          await tx.query(
            `UPDATE auctions
             SET highest_bid_id = $2,
                 current_price = $3,
                 version = $4,
                 last_bid_sequence = $5,
                 updated_at = $6::timestamptz
             WHERE id = $1`,
            [
              input.auctionId,
              bidId,
              input.amount,
              currentVersion + 1,
              nextSequenceNo,
              input.occurredAt.toISOString(),
            ],
          );
          timing.auctionUpdateMs = Date.now() - auctionUpdateStartedAtMs;
          timing.bidInsertAuctionUpdateMs = timing.bidInsertMs + timing.auctionUpdateMs;

          const responseBody = {
            result: "accepted",
            bid_id: bidId,
            auction_id: input.auctionId,
            company_id: input.companyId,
            user_id: input.userId,
            amount: Number(input.amount.toFixed(2)),
            sequence_no: nextSequenceNo,
            current_price: Number(input.amount.toFixed(2)),
            version: currentVersion + 1,
          };

          const persistedResponseResult = await tx.query<PersistedBidRequestResponseRow>(
            `UPDATE bid_requests
             SET status = 'SUCCEEDED',
                 response_status = $2,
                 response_body = $3::jsonb,
                 bid_id = $4,
                 expires_at = $5::timestamptz
             WHERE id = $1
             RETURNING response_status, response_body`,
            [
              bidRequestId,
              201,
              JSON.stringify(responseBody),
              bidId,
              bidRequestExpiresAt.toISOString(),
            ],
          );
          const persistedResponse = persistedResponseResult.rows[0];

          return {
            kind: "success",
            responseStatus: toNumber(persistedResponse.response_status, "response_status"),
            responseBody: parseStoredResponseBody(persistedResponse.response_body),
            lockWaitMs,
            timing: finalizeTiming(),
          };
        } catch (error) {
          const sqlState = extractSqlState(error);

          if (isExpectedBidContentionSqlState(sqlState)) {
            const contentionStartedAtMs = advisoryLockStartedAtMs || txStartedAtMs;
            throw new BidContentionConflictError(Date.now() - contentionStartedAtMs);
          }

          throw error;
        }
      });
    },
  };
}
