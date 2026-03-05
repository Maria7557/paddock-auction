import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../lib/domain_errors";
import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import { toNumber } from "../../lib/sql_contract";

export const WALLET_AUCTION_NOT_FOUND_CODE = "WALLET_AUCTION_NOT_FOUND";
export const WALLET_AUCTION_NOT_DEFAULTED_CODE = "WALLET_AUCTION_NOT_DEFAULTED";
export const WALLET_WINNING_BID_NOT_FOUND_CODE = "WALLET_WINNING_BID_NOT_FOUND";
export const WALLET_LOSING_BID_NOT_FOUND_CODE = "WALLET_LOSING_BID_NOT_FOUND";
export const WALLET_DEPOSIT_LOCK_NOT_FOUND_CODE = "WALLET_DEPOSIT_LOCK_NOT_FOUND";
export const WALLET_NOT_FOUND_CODE = "WALLET_NOT_FOUND";
export const WALLET_LOCKED_BALANCE_INSUFFICIENT_CODE = "WALLET_LOCKED_BALANCE_INSUFFICIENT";
export const WALLET_DEPOSIT_AMOUNT_NOT_INTEGER_CODE = "WALLET_DEPOSIT_AMOUNT_NOT_INTEGER";

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  highest_bid_id: unknown;
};

type BidRow = SqlRow & {
  id: unknown;
  user_id: unknown;
  company_id: unknown;
};

type DepositLockRow = SqlRow & {
  id: unknown;
  company_id: unknown;
  amount: unknown;
};

type WalletRow = SqlRow & {
  id: unknown;
};

type UpdateRow = SqlRow & {
  id: unknown;
};

type LedgerRow = SqlRow & {
  id: unknown;
};

type DepositWalletBalanceRow = SqlRow & {
  available_balance: unknown;
};

type DepositLockIdRow = SqlRow & {
  id: unknown;
};

export type BurnDepositForDefaultResult = {
  auctionId: string;
  winningBidId: string;
  winningUserId: string;
  companyId: string;
  lockId: string;
  burnedAmount: number;
  walletId: string;
  walletLedgerId: string;
};

export type ReleaseLosingDepositsResult = {
  auctionId: string;
  winningBidId: string;
  winningCompanyId: string;
  releasedCount: number;
  releasedLockIds: string[];
};

export type DepositService = {
  burnDepositForDefault(auctionId: string): Promise<BurnDepositForDefaultResult>;
  releaseLosingDeposits(auctionId: string): Promise<ReleaseLosingDepositsResult>;
};

export type LockDepositResult =
  | {
      kind: "created";
      lockId: string;
    }
  | {
      kind: "already_exists";
      lockId: string;
    }
  | {
      kind: "deposit_required";
    };

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (!("code" in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === "23505";
}

function toNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Field ${fieldName} must be a non-empty string. Received: ${String(value)}`);
}

function toIntegerAmount(value: number, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new DomainConflictError(
      WALLET_DEPOSIT_AMOUNT_NOT_INTEGER_CODE,
      `Field ${fieldName} must be an integer amount for wallet ledger operations`,
    );
  }

  return value;
}

export async function lockDeposit(
  tx: SqlClient,
  walletId: string,
  auctionId: string,
  amount: number,
  companyId: string,
  occurredAt: Date,
): Promise<LockDepositResult> {
  const existingLockResult = await tx.query<DepositLockIdRow>(
    `SELECT id
     FROM deposit_locks
     WHERE auction_id = $1
       AND company_id = $2
       AND status = 'ACTIVE'
     FOR UPDATE`,
    [auctionId, companyId],
  );

  if (existingLockResult.rows.length > 0) {
    return {
      kind: "already_exists",
      lockId: toNonEmptyString(existingLockResult.rows[0].id, "deposit_locks.id"),
    };
  }

  const walletBalanceResult = await tx.query<DepositWalletBalanceRow>(
    `SELECT available_balance
     FROM deposit_wallets
     WHERE id = $1
     FOR UPDATE`,
    [walletId],
  );

  if (walletBalanceResult.rows.length === 0) {
    return { kind: "deposit_required" };
  }

  const availableBalance = toNumber(
    walletBalanceResult.rows[0].available_balance,
    "deposit_wallets.available_balance",
  );

  if (availableBalance < amount) {
    return { kind: "deposit_required" };
  }

  const createdLockId = randomUUID();
  try {
    await tx.query<UpdateRow>(
      `INSERT INTO deposit_locks (
         id,
         auction_id,
         company_id,
         amount,
         status,
         created_at
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5::timestamptz)`,
      [createdLockId, auctionId, companyId, amount, occurredAt.toISOString()],
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const duplicateLockResult = await tx.query<DepositLockIdRow>(
      `SELECT id
       FROM deposit_locks
       WHERE auction_id = $1
         AND company_id = $2
         AND status = 'ACTIVE'
       FOR UPDATE`,
      [auctionId, companyId],
    );

    if (duplicateLockResult.rows.length > 0) {
      return {
        kind: "already_exists",
        lockId: toNonEmptyString(duplicateLockResult.rows[0].id, "deposit_locks.id"),
      };
    }

    throw error;
  }

  const walletUpdateResult = await tx.query<UpdateRow>(
    `UPDATE deposit_wallets
     SET available_balance = available_balance - $2,
         locked_balance = locked_balance + $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND available_balance >= $2
     RETURNING id`,
    [walletId, amount],
  );

  if (walletUpdateResult.rows.length === 0) {
    throw new DomainConflictError(
      WALLET_LOCKED_BALANCE_INSUFFICIENT_CODE,
      `Insufficient deposit wallet balance for wallet ${walletId}`,
    );
  }

  return {
    kind: "created",
    lockId: createdLockId,
  };
}

export function createDepositService(
  transactionRunner: SqlTransactionRunner,
  now: () => Date = () => new Date(),
): DepositService {
  return {
    async burnDepositForDefault(auctionId: string): Promise<BurnDepositForDefaultResult> {
      return transactionRunner.transaction(async (tx) => {
        const occurredAt = now();

        const auctionResult = await tx.query<AuctionRow>(
          `SELECT id, state, highest_bid_id
           FROM auctions
           WHERE id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (auctionResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_AUCTION_NOT_FOUND_CODE,
            `Auction ${auctionId} was not found`,
          );
        }

        const auction = auctionResult.rows[0];
        const auctionState = toNonEmptyString(auction.state, "auction.state");

        if (auctionState !== "DEFAULTED") {
          throw new DomainConflictError(
            WALLET_AUCTION_NOT_DEFAULTED_CODE,
            `Auction ${auctionId} must be DEFAULTED before burning deposit`,
          );
        }

        const highestBidId =
          auction.highest_bid_id === null || auction.highest_bid_id === undefined
            ? null
            : toNonEmptyString(auction.highest_bid_id, "auction.highest_bid_id");

        if (highestBidId === null) {
          throw new DomainNotFoundError(
            WALLET_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid was not found for auction ${auctionId}`,
          );
        }

        const winningBidResult = await tx.query<BidRow>(
          `SELECT id, user_id, company_id
           FROM bids
           WHERE id = $1
             AND auction_id = $2
           FOR UPDATE`,
          [highestBidId, auctionId],
        );

        if (winningBidResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid ${highestBidId} was not found for auction ${auctionId}`,
          );
        }

        const winningBid = winningBidResult.rows[0];
        const winningUserId = toNonEmptyString(winningBid.user_id, "bids.user_id");
        const companyId = toNonEmptyString(winningBid.company_id, "bids.company_id");

        const lockResult = await tx.query<DepositLockRow>(
          `SELECT id, amount
           FROM deposit_locks
           WHERE auction_id = $1
             AND company_id = $2
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [auctionId, companyId],
        );

        if (lockResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_DEPOSIT_LOCK_NOT_FOUND_CODE,
            `Active deposit lock was not found for auction ${auctionId} and company ${companyId}`,
          );
        }

        const lock = lockResult.rows[0];
        const lockId = toNonEmptyString(lock.id, "deposit_locks.id");
        const burnedAmount = toIntegerAmount(toNumber(lock.amount, "deposit_locks.amount"), "deposit_locks.amount");

        await tx.query<UpdateRow>(
          `UPDATE deposit_locks
           SET status = 'BURNED',
               burned_at = $2::timestamptz,
               resolution_reason = COALESCE(resolution_reason, 'PAYMENT_DEFAULTED_DEADLINE')
           WHERE id = $1
           RETURNING id`,
          [lockId, occurredAt.toISOString()],
        );

        const walletResult = await tx.query<WalletRow>(
          `SELECT id
           FROM "Wallet"
           WHERE "userId" = $1
           FOR UPDATE`,
          [winningUserId],
        );

        if (walletResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_NOT_FOUND_CODE,
            `Wallet was not found for winning user ${winningUserId}`,
          );
        }

        const walletId = toNonEmptyString(walletResult.rows[0].id, "Wallet.id");

        const walletUpdateResult = await tx.query<UpdateRow>(
          `UPDATE "Wallet"
           SET "lockedBalance" = "lockedBalance" - $2
           WHERE id = $1
             AND "lockedBalance" >= $2
           RETURNING id`,
          [walletId, burnedAmount],
        );

        if (walletUpdateResult.rows.length === 0) {
          throw new DomainConflictError(
            WALLET_LOCKED_BALANCE_INSUFFICIENT_CODE,
            `Insufficient wallet locked balance for user ${winningUserId}`,
          );
        }

        const walletLedgerId = randomUUID();
        const ledgerInsertResult = await tx.query<LedgerRow>(
          `INSERT INTO "WalletLedger" (
             id,
             "walletId",
             type,
             amount,
             reference,
             "createdAt"
           ) VALUES ($1, $2, $3::"LedgerType", $4, $5, $6::timestamptz)
           RETURNING id`,
          [
            walletLedgerId,
            walletId,
            "DEPOSIT_BURN",
            burnedAmount,
            lockId,
            occurredAt.toISOString(),
          ],
        );

        return {
          auctionId,
          winningBidId: highestBidId,
          winningUserId,
          companyId,
          lockId,
          burnedAmount,
          walletId,
          walletLedgerId: toNonEmptyString(ledgerInsertResult.rows[0].id, "WalletLedger.id"),
        };
      });
    },

    async releaseLosingDeposits(auctionId: string): Promise<ReleaseLosingDepositsResult> {
      return transactionRunner.transaction(async (tx) => {
        const occurredAt = now();

        const auctionResult = await tx.query<AuctionRow>(
          `SELECT id, state, highest_bid_id
           FROM auctions
           WHERE id = $1
           FOR UPDATE`,
          [auctionId],
        );

        if (auctionResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_AUCTION_NOT_FOUND_CODE,
            `Auction ${auctionId} was not found`,
          );
        }

        const auction = auctionResult.rows[0];
        const highestBidId =
          auction.highest_bid_id === null || auction.highest_bid_id === undefined
            ? null
            : toNonEmptyString(auction.highest_bid_id, "auction.highest_bid_id");

        if (highestBidId === null) {
          throw new DomainNotFoundError(
            WALLET_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid was not found for auction ${auctionId}`,
          );
        }

        const winningBidResult = await tx.query<BidRow>(
          `SELECT id, user_id, company_id
           FROM bids
           WHERE id = $1
             AND auction_id = $2
           FOR UPDATE`,
          [highestBidId, auctionId],
        );

        if (winningBidResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_WINNING_BID_NOT_FOUND_CODE,
            `Winning bid ${highestBidId} was not found for auction ${auctionId}`,
          );
        }

        const winningCompanyId = toNonEmptyString(
          winningBidResult.rows[0].company_id,
          "winning_bid.company_id",
        );

        const losingLocksResult = await tx.query<DepositLockRow>(
          `SELECT id, company_id, amount
           FROM deposit_locks
           WHERE auction_id = $1
             AND status = 'ACTIVE'
             AND company_id <> $2
           FOR UPDATE`,
          [auctionId, winningCompanyId],
        );

        const releasedLockIds: string[] = [];

        for (const losingLock of losingLocksResult.rows) {
          const lockId = toNonEmptyString(losingLock.id, "deposit_locks.id");
          const companyId = toNonEmptyString(losingLock.company_id, "deposit_locks.company_id");
          const releaseAmount = toIntegerAmount(
            toNumber(losingLock.amount, "deposit_locks.amount"),
            "deposit_locks.amount",
          );

          const losingBidderResult = await tx.query<BidRow>(
            `SELECT user_id
             FROM bids
             WHERE auction_id = $1
               AND company_id = $2
             ORDER BY sequence_no DESC
             LIMIT 1
             FOR UPDATE`,
            [auctionId, companyId],
          );

          if (losingBidderResult.rows.length === 0) {
            throw new DomainNotFoundError(
              WALLET_LOSING_BID_NOT_FOUND_CODE,
              `Losing bidder was not found for auction ${auctionId} and company ${companyId}`,
            );
          }

          const losingUserId = toNonEmptyString(losingBidderResult.rows[0].user_id, "losing_bid.user_id");
          const walletResult = await tx.query<WalletRow>(
            `SELECT id
             FROM "Wallet"
             WHERE "userId" = $1
             FOR UPDATE`,
            [losingUserId],
          );

          if (walletResult.rows.length === 0) {
            throw new DomainNotFoundError(
              WALLET_NOT_FOUND_CODE,
              `Wallet was not found for losing user ${losingUserId}`,
            );
          }

          const walletId = toNonEmptyString(walletResult.rows[0].id, "Wallet.id");

          const walletUpdateResult = await tx.query<UpdateRow>(
            `UPDATE "Wallet"
             SET "lockedBalance" = "lockedBalance" - $2,
                 balance = balance + $2
             WHERE id = $1
               AND "lockedBalance" >= $2
             RETURNING id`,
            [walletId, releaseAmount],
          );

          if (walletUpdateResult.rows.length === 0) {
            throw new DomainConflictError(
              WALLET_LOCKED_BALANCE_INSUFFICIENT_CODE,
              `Insufficient wallet locked balance for losing user ${losingUserId}`,
            );
          }

          await tx.query<UpdateRow>(
            `UPDATE deposit_locks
             SET status = 'RELEASED',
                 released_at = $2::timestamptz,
                 resolution_reason = COALESCE(resolution_reason, 'AUCTION_LOST_RELEASE')
             WHERE id = $1
             RETURNING id`,
            [lockId, occurredAt.toISOString()],
          );

          await tx.query<LedgerRow>(
            `INSERT INTO "WalletLedger" (
               id,
               "walletId",
               type,
               amount,
               reference,
               "createdAt"
             ) VALUES ($1, $2, $3::"LedgerType", $4, $5, $6::timestamptz)
             RETURNING id`,
            [
              randomUUID(),
              walletId,
              "DEPOSIT_RELEASE",
              releaseAmount,
              lockId,
              occurredAt.toISOString(),
            ],
          );

          releasedLockIds.push(lockId);
        }

        return {
          auctionId,
          winningBidId: highestBidId,
          winningCompanyId,
          releasedCount: releasedLockIds.length,
          releasedLockIds,
        };
      });
    },
  };
}
