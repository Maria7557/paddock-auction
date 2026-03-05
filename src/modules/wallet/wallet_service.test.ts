import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError, DomainNotFoundError } from "../../lib/domain_errors";
import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import {
  createWalletService,
  WALLET_INVALID_TOPUP_AMOUNT_CODE,
  WALLET_NOT_FOUND_CODE,
} from "./wallet_service";

function createRunnerWithTx(tx: SqlClient): SqlTransactionRunner {
  return {
    async transaction<T>(handler: (transactionClient: SqlClient) => Promise<T>): Promise<T> {
      return handler(tx);
    },
  };
}

test("topUpDeposit increases wallet balance and inserts DEPOSIT_TOPUP ledger", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ sql, params });

      if (sql.includes('FROM "Wallet"') && sql.includes('WHERE "userId" = $1')) {
        return {
          rows: [{ id: "wallet-1", balance: 100 }] as T[],
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

  const service = createWalletService(createRunnerWithTx(tx));
  const result = await service.topUpDeposit({
    userId: "user-1",
    amount: 50,
    occurredAt: new Date("2026-03-05T10:00:00.000Z"),
  });

  assert.equal(result.walletId, "wallet-1");
  assert.equal(result.userId, "user-1");
  assert.equal(result.amount, 50);
  assert.equal(result.balance, 150);
  assert.equal(result.ledgerId, "ledger-1");
  assert.equal(queries.length, 3);
  assert.equal(queries[2].params[2], "DEPOSIT_TOPUP");
});

test("topUpDeposit rejects non-positive or non-integer amount", async () => {
  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    },
  };

  const service = createWalletService(createRunnerWithTx(tx));

  await assert.rejects(
    async () => {
      await service.topUpDeposit({
        userId: "user-1",
        amount: 10.5,
        occurredAt: new Date("2026-03-05T10:00:00.000Z"),
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof DomainConflictError);
      assert.equal(error.code, WALLET_INVALID_TOPUP_AMOUNT_CODE);
      return true;
    },
  );
});

test("topUpDeposit throws WALLET_NOT_FOUND when wallet does not exist", async () => {
  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string): Promise<{ rows: T[] }> {
      if (sql.includes('FROM "Wallet"') && sql.includes('WHERE "userId" = $1')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const service = createWalletService(createRunnerWithTx(tx));

  await assert.rejects(
    async () => {
      await service.topUpDeposit({
        userId: "user-missing",
        amount: 100,
        occurredAt: new Date("2026-03-05T10:00:00.000Z"),
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof DomainNotFoundError);
      assert.equal(error.code, WALLET_NOT_FOUND_CODE);
      return true;
    },
  );
});
