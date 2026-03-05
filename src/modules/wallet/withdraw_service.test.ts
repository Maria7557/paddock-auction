import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError, DomainNotFoundError } from "../../lib/domain_errors";
import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import {
  createWithdrawService,
  WALLET_INSUFFICIENT_BALANCE_CODE,
  WALLET_INVALID_WITHDRAW_AMOUNT_CODE,
  WALLET_NOT_FOUND_CODE,
} from "./withdraw_service";

function createRunnerWithTx(tx: SqlClient): SqlTransactionRunner {
  return {
    async transaction<T>(handler: (transactionClient: SqlClient) => Promise<T>): Promise<T> {
      return handler(tx);
    },
  };
}

test("withdrawWallet decreases wallet balance and inserts WITHDRAWAL ledger", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ sql, params });

      if (sql.includes('FROM "Wallet"') && sql.includes('WHERE "userId" = $1')) {
        return {
          rows: [{ id: "wallet-1", balance: 200 }] as T[],
        };
      }

      if (sql.startsWith('UPDATE "Wallet"')) {
        return {
          rows: [{ id: "wallet-1", balance: 150 }] as T[],
        };
      }

      if (sql.startsWith('INSERT INTO "WalletLedger"')) {
        return {
          rows: [{ id: "ledger-1" }] as T[],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const service = createWithdrawService(createRunnerWithTx(tx));
  const result = await service.withdrawWallet("user-1", 50);

  assert.equal(result.walletId, "wallet-1");
  assert.equal(result.userId, "user-1");
  assert.equal(result.amount, 50);
  assert.equal(result.balance, 150);
  assert.equal(result.ledgerId, "ledger-1");
  assert.equal(queries.length, 3);
  assert.equal(queries[2].params[2], "WITHDRAWAL");
});

test("withdrawWallet rejects amount larger than balance", async () => {
  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string): Promise<{ rows: T[] }> {
      if (sql.includes('FROM "Wallet"') && sql.includes('WHERE "userId" = $1')) {
        return {
          rows: [{ id: "wallet-1", balance: 25 }] as T[],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const service = createWithdrawService(createRunnerWithTx(tx));

  await assert.rejects(
    async () => {
      await service.withdrawWallet("user-1", 30);
    },
    (error: unknown) => {
      assert.ok(error instanceof DomainConflictError);
      assert.equal(error.code, WALLET_INSUFFICIENT_BALANCE_CODE);
      return true;
    },
  );
});

test("withdrawWallet rejects non-positive or non-integer amount", async () => {
  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  };

  const service = createWithdrawService(createRunnerWithTx(tx));

  await assert.rejects(
    async () => {
      await service.withdrawWallet("user-1", 0);
    },
    (error: unknown) => {
      assert.ok(error instanceof DomainConflictError);
      assert.equal(error.code, WALLET_INVALID_WITHDRAW_AMOUNT_CODE);
      return true;
    },
  );
});

test("withdrawWallet throws WALLET_NOT_FOUND when wallet does not exist", async () => {
  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string): Promise<{ rows: T[] }> {
      if (sql.includes('FROM "Wallet"') && sql.includes('WHERE "userId" = $1')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const service = createWithdrawService(createRunnerWithTx(tx));

  await assert.rejects(
    async () => {
      await service.withdrawWallet("user-missing", 100);
    },
    (error: unknown) => {
      assert.ok(error instanceof DomainNotFoundError);
      assert.equal(error.code, WALLET_NOT_FOUND_CODE);
      return true;
    },
  );
});
