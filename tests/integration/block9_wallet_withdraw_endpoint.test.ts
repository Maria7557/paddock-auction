import assert from "node:assert/strict";
import test from "node:test";

import { createWithdrawService } from "../../src/modules/wallet/withdraw_service";
import { createPostWalletWithdrawHandler } from "../../src/modules/wallet/withdraw_controller";
import {
  WALLET_INSUFFICIENT_BALANCE_CODE,
} from "../../src/modules/wallet/withdraw_service";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";
import { createMigratedTestDb } from "./helpers/migration_harness";

async function withMigratedDb(
  assertion: (context: Awaited<ReturnType<typeof createMigratedTestDb>>) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion(migratedDb);
  } finally {
    await migratedDb.cleanup();
  }
}

async function seedWallet(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: { userId: string; walletId: string; balance: number; lockedBalance?: number },
): Promise<void> {
  await db.query(
    `INSERT INTO "User" (id, email) VALUES ($1, $2)`,
    [input.userId, `${input.userId}@example.test`],
  );

  await db.query(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance"
     ) VALUES ($1, $2, $3, $4)`,
    [input.walletId, input.userId, input.balance, input.lockedBalance ?? 0],
  );
}

async function parseResponse(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown>; errorCode: string | null }> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    errorCode: response.headers.get("x-error-code"),
  };
}

function buildWithdrawRequest(userId: string, amount: number): Request {
  return new Request("https://example.com/api/wallet/withdraw", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({ amount }),
  });
}

test("wallet withdraw endpoint works with authenticated user", async () => {
  await withMigratedDb(async ({ db }) => {
    await seedWallet(db, {
      userId: "user-wallet-withdraw-1",
      walletId: "wallet-wallet-withdraw-1",
      balance: 300,
      lockedBalance: 10,
    });

    const withdrawService = createWithdrawService(createPgliteTransactionRunner(db));
    const handler = createPostWalletWithdrawHandler({
      withdrawService,
    });

    const response = await parseResponse(
      await handler(buildWithdrawRequest("user-wallet-withdraw-1", 120)),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result, "accepted");
    assert.equal(response.body.user_id, "user-wallet-withdraw-1");
    assert.equal(response.body.amount, 120);
    assert.equal(response.body.balance, 180);

    const walletRow = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-wallet-withdraw-1"],
    );

    assert.equal(Number(walletRow.rows[0].balance), 180);
    assert.equal(Number(walletRow.rows[0].lockedBalance), 10);

    const ledgerRows = await db.query<{ type: string; amount: number; walletId: string }>(
      `SELECT type, amount, "walletId"
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-wallet-withdraw-1"],
    );

    assert.equal(ledgerRows.rows.length, 1);
    assert.equal(ledgerRows.rows[0].type, "WITHDRAWAL");
    assert.equal(Number(ledgerRows.rows[0].amount), 120);
    assert.equal(ledgerRows.rows[0].walletId, "wallet-wallet-withdraw-1");
  });
});

test("wallet withdraw endpoint rejects amount larger than available balance", async () => {
  await withMigratedDb(async ({ db }) => {
    await seedWallet(db, {
      userId: "user-wallet-withdraw-2",
      walletId: "wallet-wallet-withdraw-2",
      balance: 100,
      lockedBalance: 0,
    });

    const withdrawService = createWithdrawService(createPgliteTransactionRunner(db));
    const handler = createPostWalletWithdrawHandler({
      withdrawService,
    });

    const response = await parseResponse(
      await handler(buildWithdrawRequest("user-wallet-withdraw-2", 150)),
    );

    assert.equal(response.status, 409);
    assert.equal(response.errorCode, WALLET_INSUFFICIENT_BALANCE_CODE);
    assert.equal(response.body.error_code, WALLET_INSUFFICIENT_BALANCE_CODE);

    const walletRow = await db.query<{ balance: number }>(
      `SELECT balance
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-wallet-withdraw-2"],
    );

    assert.equal(Number(walletRow.rows[0].balance), 100);

    const ledgerRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-wallet-withdraw-2"],
    );

    assert.equal(ledgerRows.rows[0].count, 0);
  });
});
