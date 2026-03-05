import assert from "node:assert/strict";
import test from "node:test";

import { createWalletService } from "../../src/modules/wallet/wallet_service";
import { createPostWalletDepositHandler } from "../../src/modules/wallet/wallet_controller";
import { WALLET_NOT_FOUND_CODE } from "../../src/modules/wallet/wallet_service";
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

function buildDepositRequest(userId: string, amount: number): Request {
  return new Request("https://example.com/api/wallet/deposit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({ amount }),
  });
}

test("wallet deposit endpoint increases balance and writes DEPOSIT_TOPUP ledger entry", async () => {
  await withMigratedDb(async ({ db }) => {
    await seedWallet(db, {
      userId: "user-wallet-topup-1",
      walletId: "wallet-wallet-topup-1",
      balance: 100,
      lockedBalance: 10,
    });

    const walletService = createWalletService(createPgliteTransactionRunner(db));
    const handler = createPostWalletDepositHandler({
      walletService,
      now: () => new Date("2026-03-05T11:00:00Z"),
    });

    const response = await parseResponse(
      await handler(buildDepositRequest("user-wallet-topup-1", 250)),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result, "accepted");
    assert.equal(response.body.user_id, "user-wallet-topup-1");
    assert.equal(response.body.amount, 250);
    assert.equal(response.body.balance, 350);

    const walletRow = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-wallet-topup-1"],
    );

    assert.equal(Number(walletRow.rows[0].balance), 350);
    assert.equal(Number(walletRow.rows[0].lockedBalance), 10);

    const ledgerRows = await db.query<{ type: string; amount: number; walletId: string }>(
      `SELECT type, amount, "walletId"
       FROM "WalletLedger"
       WHERE "walletId" = $1`,
      ["wallet-wallet-topup-1"],
    );

    assert.equal(ledgerRows.rows.length, 1);
    assert.equal(ledgerRows.rows[0].type, "DEPOSIT_TOPUP");
    assert.equal(Number(ledgerRows.rows[0].amount), 250);
    assert.equal(ledgerRows.rows[0].walletId, "wallet-wallet-topup-1");
  });
});

test("wallet deposit endpoint returns WALLET_NOT_FOUND for missing wallet", async () => {
  await withMigratedDb(async ({ db }) => {
    const walletService = createWalletService(createPgliteTransactionRunner(db));
    const handler = createPostWalletDepositHandler({
      walletService,
      now: () => new Date("2026-03-05T11:00:00Z"),
    });

    const response = await parseResponse(
      await handler(buildDepositRequest("user-wallet-topup-missing", 100)),
    );

    assert.equal(response.status, 404);
    assert.equal(response.errorCode, WALLET_NOT_FOUND_CODE);
    assert.equal(response.body.error_code, WALLET_NOT_FOUND_CODE);
  });
});
