import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../lib/domain_errors";
import type { SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import { toNumber } from "../../lib/sql_contract";

export const WALLET_NOT_FOUND_CODE = "WALLET_NOT_FOUND";
export const WALLET_INVALID_TOPUP_AMOUNT_CODE = "WALLET_INVALID_TOPUP_AMOUNT";

type WalletRow = SqlRow & {
  id: unknown;
  balance: unknown;
};

type LedgerRow = SqlRow & {
  id: unknown;
};

export type TopUpDepositCommand = {
  userId: string;
  amount: number;
  occurredAt: Date;
};

export type TopUpDepositResult = {
  walletId: string;
  userId: string;
  amount: number;
  balance: number;
  ledgerId: string;
};

export type WalletService = {
  topUpDeposit(command: TopUpDepositCommand): Promise<TopUpDepositResult>;
};

function toNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Field ${fieldName} must be a non-empty string. Received: ${String(value)}`);
}

function validateTopUpAmount(amount: number): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new DomainConflictError(
      WALLET_INVALID_TOPUP_AMOUNT_CODE,
      "Wallet top-up amount must be a positive integer",
    );
  }

  return amount;
}

export function createWalletService(
  transactionRunner: SqlTransactionRunner,
): WalletService {
  return {
    async topUpDeposit(command: TopUpDepositCommand): Promise<TopUpDepositResult> {
      const amount = validateTopUpAmount(command.amount);

      return transactionRunner.transaction(async (tx) => {
        const walletResult = await tx.query<WalletRow>(
          `SELECT id, balance
           FROM "Wallet"
           WHERE "userId" = $1
           FOR UPDATE`,
          [command.userId],
        );

        if (walletResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_NOT_FOUND_CODE,
            `Wallet was not found for user ${command.userId}`,
          );
        }

        const walletId = toNonEmptyString(walletResult.rows[0].id, "Wallet.id");

        const walletUpdateResult = await tx.query<WalletRow>(
          `UPDATE "Wallet"
           SET balance = balance + $2
           WHERE id = $1
           RETURNING id, balance`,
          [walletId, amount],
        );

        if (walletUpdateResult.rows.length === 0) {
          throw new DomainNotFoundError(
            WALLET_NOT_FOUND_CODE,
            `Wallet was not found for user ${command.userId}`,
          );
        }

        const updatedWallet = walletUpdateResult.rows[0];
        const updatedWalletId = toNonEmptyString(updatedWallet.id, "Wallet.id");
        const updatedBalance = toNumber(updatedWallet.balance, "Wallet.balance");

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
            randomUUID(),
            updatedWalletId,
            "DEPOSIT_TOPUP",
            amount,
            null,
            command.occurredAt.toISOString(),
          ],
        );

        const ledgerId = toNonEmptyString(ledgerInsertResult.rows[0].id, "WalletLedger.id");

        return {
          walletId: updatedWalletId,
          userId: command.userId,
          amount,
          balance: updatedBalance,
          ledgerId,
        };
      });
    },
  };
}
