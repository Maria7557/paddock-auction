import { DomainNotFoundError } from "../../../lib/domain_errors";
import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";

export const DEPOSIT_WALLET_NOT_FOUND_CODE = "DEPOSIT_WALLET_NOT_FOUND";
export const DEPOSIT_LOCK_NOT_FOUND_CODE = "DEPOSIT_LOCK_NOT_FOUND";
export const DEPOSIT_AUCTION_NOT_FOUND_CODE = "DEPOSIT_AUCTION_NOT_FOUND";

export type DepositWalletSnapshot = {
  id: string;
  companyId: string;
  currency: string;
  availableBalance: number;
  lockedBalance: number;
  pendingWithdrawalBalance: number;
};

export type DepositLockSnapshot = {
  id: string;
  auctionId: string;
  companyId: string;
  amount: number;
  status: "ACTIVE" | "RELEASED" | "BURNED";
  releasedAt: Date | null;
  burnedAt: Date | null;
};

type DepositWalletRow = SqlRow & {
  id: unknown;
  company_id: unknown;
  currency: unknown;
  available_balance: unknown;
  locked_balance: unknown;
  pending_withdrawal_balance: unknown;
};

type DepositLockRow = SqlRow & {
  id: unknown;
  auction_id: unknown;
  company_id: unknown;
  amount: unknown;
  status: unknown;
  released_at: unknown;
  burned_at: unknown;
};

type AuctionRow = SqlRow & { id: unknown };

function mapWalletRow(row: DepositWalletRow): DepositWalletSnapshot {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    currency: String(row.currency),
    availableBalance: toNumber(row.available_balance, "available_balance"),
    lockedBalance: toNumber(row.locked_balance, "locked_balance"),
    pendingWithdrawalBalance: toNumber(row.pending_withdrawal_balance, "pending_withdrawal_balance"),
  };
}

function mapLockRow(row: DepositLockRow): DepositLockSnapshot {
  return {
    id: String(row.id),
    auctionId: String(row.auction_id),
    companyId: String(row.company_id),
    amount: toNumber(row.amount, "amount"),
    status: String(row.status) as DepositLockSnapshot["status"],
    releasedAt: row.released_at ? new Date(String(row.released_at)) : null,
    burnedAt: row.burned_at ? new Date(String(row.burned_at)) : null,
  };
}

export type DepositCommandTransaction = {
  lockWalletRow(companyId: string, currency: string): Promise<DepositWalletSnapshot | null>;
  ensureWalletRow(companyId: string, currency: string, walletId: string): Promise<DepositWalletSnapshot>;
  lockAuctionRow(auctionId: string): Promise<void>;
  lockActiveLockForAuctionCompany(
    auctionId: string,
    companyId: string,
  ): Promise<DepositLockSnapshot | null>;
  insertActiveLock(lockId: string, auctionId: string, companyId: string, amount: number): Promise<DepositLockSnapshot>;
  lockById(lockId: string): Promise<DepositLockSnapshot>;
  loadLockReference(lockId: string): Promise<Pick<DepositLockSnapshot, "id" | "auctionId" | "companyId">>;
  incrementWalletAvailable(walletId: string, amount: number): Promise<DepositWalletSnapshot>;
  applyWalletAcquire(walletId: string, amount: number): Promise<DepositWalletSnapshot | null>;
  applyWalletRelease(walletId: string, amount: number): Promise<DepositWalletSnapshot | null>;
  applyWalletBurn(walletId: string, amount: number): Promise<DepositWalletSnapshot | null>;
  resolveLock(
    lockId: string,
    nextState: "RELEASED" | "BURNED",
    occurredAt: Date,
    resolutionReason?: string,
  ): Promise<DepositLockSnapshot>;
};

export type DepositCommandRepository = {
  transaction<T>(handler: (tx: DepositCommandTransaction) => Promise<T>): Promise<T>;
};

function createDepositCommandTransaction(tx: SqlClient): DepositCommandTransaction {
  return {
    async lockWalletRow(companyId: string, currency: string): Promise<DepositWalletSnapshot | null> {
      const result = await tx.query<DepositWalletRow>(
        `SELECT
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance
         FROM deposit_wallets
         WHERE company_id = $1 AND currency = $2
         FOR UPDATE`,
        [companyId, currency],
      );

      return result.rows.length === 0 ? null : mapWalletRow(result.rows[0]);
    },

    async ensureWalletRow(companyId: string, currency: string, walletId: string): Promise<DepositWalletSnapshot> {
      await tx.query(
        `INSERT INTO deposit_wallets (
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance
         ) VALUES ($1, $2, $3, 0, 0, 0)
         ON CONFLICT (company_id, currency)
         DO NOTHING`,
        [walletId, companyId, currency],
      );

      const wallet = await this.lockWalletRow(companyId, currency);

      if (wallet === null) {
        throw new DomainNotFoundError(
          DEPOSIT_WALLET_NOT_FOUND_CODE,
          `Wallet for company ${companyId} and currency ${currency} was not found`,
        );
      }

      return wallet;
    },

    async lockAuctionRow(auctionId: string): Promise<void> {
      const result = await tx.query<AuctionRow>(
        `SELECT id
         FROM auctions
         WHERE id = $1
         FOR UPDATE`,
        [auctionId],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(
          DEPOSIT_AUCTION_NOT_FOUND_CODE,
          `Auction ${auctionId} was not found for deposit mutation`,
        );
      }
    },

    async lockActiveLockForAuctionCompany(
      auctionId: string,
      companyId: string,
    ): Promise<DepositLockSnapshot | null> {
      const result = await tx.query<DepositLockRow>(
        `SELECT
           id,
           auction_id,
           company_id,
           amount,
           status,
           released_at,
           burned_at
         FROM deposit_locks
         WHERE auction_id = $1
           AND company_id = $2
           AND status = 'ACTIVE'
         FOR UPDATE`,
        [auctionId, companyId],
      );

      return result.rows.length === 0 ? null : mapLockRow(result.rows[0]);
    },

    async insertActiveLock(
      lockId: string,
      auctionId: string,
      companyId: string,
      amount: number,
    ): Promise<DepositLockSnapshot> {
      const result = await tx.query<DepositLockRow>(
        `INSERT INTO deposit_locks (
           id,
           auction_id,
           company_id,
           amount,
           status
         ) VALUES ($1, $2, $3, $4, 'ACTIVE')
         RETURNING
           id,
           auction_id,
           company_id,
           amount,
           status,
           released_at,
           burned_at`,
        [lockId, auctionId, companyId, amount],
      );

      return mapLockRow(result.rows[0]);
    },

    async loadLockReference(
      lockId: string,
    ): Promise<Pick<DepositLockSnapshot, "id" | "auctionId" | "companyId">> {
      const result = await tx.query<DepositLockRow>(
        `SELECT id, auction_id, company_id, amount, status, released_at, burned_at
         FROM deposit_locks
         WHERE id = $1`,
        [lockId],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(
          DEPOSIT_LOCK_NOT_FOUND_CODE,
          `Deposit lock ${lockId} was not found`,
        );
      }

      const mapped = mapLockRow(result.rows[0]);
      return {
        id: mapped.id,
        auctionId: mapped.auctionId,
        companyId: mapped.companyId,
      };
    },

    async lockById(lockId: string): Promise<DepositLockSnapshot> {
      const result = await tx.query<DepositLockRow>(
        `SELECT
           id,
           auction_id,
           company_id,
           amount,
           status,
           released_at,
           burned_at
         FROM deposit_locks
         WHERE id = $1
         FOR UPDATE`,
        [lockId],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(
          DEPOSIT_LOCK_NOT_FOUND_CODE,
          `Deposit lock ${lockId} was not found`,
        );
      }

      return mapLockRow(result.rows[0]);
    },

    async incrementWalletAvailable(walletId: string, amount: number): Promise<DepositWalletSnapshot> {
      const result = await tx.query<DepositWalletRow>(
        `UPDATE deposit_wallets
         SET available_balance = available_balance + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance`,
        [walletId, amount],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(DEPOSIT_WALLET_NOT_FOUND_CODE, `Wallet ${walletId} was not found`);
      }

      return mapWalletRow(result.rows[0]);
    },

    async applyWalletAcquire(
      walletId: string,
      amount: number,
    ): Promise<DepositWalletSnapshot | null> {
      const result = await tx.query<DepositWalletRow>(
        `UPDATE deposit_wallets
         SET available_balance = available_balance - $2,
             locked_balance = locked_balance + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND available_balance >= $2
         RETURNING
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance`,
        [walletId, amount],
      );

      return result.rows.length === 0 ? null : mapWalletRow(result.rows[0]);
    },

    async applyWalletRelease(
      walletId: string,
      amount: number,
    ): Promise<DepositWalletSnapshot | null> {
      const result = await tx.query<DepositWalletRow>(
        `UPDATE deposit_wallets
         SET available_balance = available_balance + $2,
             locked_balance = locked_balance - $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND locked_balance >= $2
         RETURNING
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance`,
        [walletId, amount],
      );

      return result.rows.length === 0 ? null : mapWalletRow(result.rows[0]);
    },

    async applyWalletBurn(walletId: string, amount: number): Promise<DepositWalletSnapshot | null> {
      const result = await tx.query<DepositWalletRow>(
        `UPDATE deposit_wallets
         SET locked_balance = locked_balance - $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND locked_balance >= $2
         RETURNING
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance`,
        [walletId, amount],
      );

      return result.rows.length === 0 ? null : mapWalletRow(result.rows[0]);
    },

    async resolveLock(
      lockId: string,
      nextState: "RELEASED" | "BURNED",
      occurredAt: Date,
      resolutionReason?: string,
    ): Promise<DepositLockSnapshot> {
      const result = await tx.query<DepositLockRow>(
        `UPDATE deposit_locks
         SET status = $2::"DepositLockStatus",
             released_at = CASE WHEN $2::"DepositLockStatus" = 'RELEASED' THEN $3::timestamptz ELSE released_at END,
             burned_at = CASE WHEN $2::"DepositLockStatus" = 'BURNED' THEN $3::timestamptz ELSE burned_at END,
             resolution_reason = COALESCE($4, resolution_reason)
         WHERE id = $1
         RETURNING
           id,
           auction_id,
           company_id,
           amount,
           status,
           released_at,
           burned_at`,
        [lockId, nextState, occurredAt.toISOString(), resolutionReason ?? null],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(DEPOSIT_LOCK_NOT_FOUND_CODE, `Deposit lock ${lockId} was not found`);
      }

      return mapLockRow(result.rows[0]);
    },
  };
}

export function createDepositCommandRepository(
  transactionRunner: SqlTransactionRunner,
): DepositCommandRepository {
  return {
    async transaction<T>(handler: (tx: DepositCommandTransaction) => Promise<T>): Promise<T> {
      return transactionRunner.transaction(async (tx) => {
        const commandTx = createDepositCommandTransaction(tx);
        return handler(commandTx);
      });
    },
  };
}
