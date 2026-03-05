import assert from "node:assert/strict";
import test from "node:test";

import { DomainNotFoundError } from "../../lib/domain_errors";
import {
  createPostWalletDepositHandler,
  WALLET_INVALID_DEPOSIT_REQUEST_CODE,
  WALLET_USER_ID_REQUIRED_CODE,
} from "./wallet_controller";
import { WALLET_NOT_FOUND_CODE } from "./wallet_service";

async function parseResponse(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown>; errorCode: string | null }> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    errorCode: response.headers.get("x-error-code"),
  };
}

test("wallet deposit controller rejects missing x-user-id header", async () => {
  const handler = createPostWalletDepositHandler({
    walletService: {
      topUpDeposit: async () => {
        throw new Error("should not be called");
      },
    },
    now: () => new Date("2026-03-05T10:00:00.000Z"),
  });

  const response = await parseResponse(
    await handler(
      new Request("https://example.com/api/wallet/deposit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount: 100 }),
      }),
    ),
  );

  assert.equal(response.status, 400);
  assert.equal(response.errorCode, WALLET_USER_ID_REQUIRED_CODE);
  assert.equal(response.body.error_code, WALLET_USER_ID_REQUIRED_CODE);
});

test("wallet deposit controller rejects invalid payload", async () => {
  const handler = createPostWalletDepositHandler({
    walletService: {
      topUpDeposit: async () => {
        throw new Error("should not be called");
      },
    },
    now: () => new Date("2026-03-05T10:00:00.000Z"),
  });

  const response = await parseResponse(
    await handler(
      new Request("https://example.com/api/wallet/deposit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({ amount: -1 }),
      }),
    ),
  );

  assert.equal(response.status, 400);
  assert.equal(response.errorCode, WALLET_INVALID_DEPOSIT_REQUEST_CODE);
  assert.equal(response.body.error_code, WALLET_INVALID_DEPOSIT_REQUEST_CODE);
});

test("wallet deposit controller returns accepted response on success", async () => {
  let capturedCommand: unknown;

  const handler = createPostWalletDepositHandler({
    walletService: {
      topUpDeposit: async (command) => {
        capturedCommand = command;
        return {
          walletId: "wallet-1",
          userId: command.userId,
          amount: command.amount,
          balance: 500,
          ledgerId: "ledger-1",
        };
      },
    },
    now: () => new Date("2026-03-05T10:00:00.000Z"),
  });

  const response = await parseResponse(
    await handler(
      new Request("https://example.com/api/wallet/deposit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({ amount: 100 }),
      }),
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.errorCode, null);
  assert.equal(response.body.result, "accepted");
  assert.equal(response.body.wallet_id, "wallet-1");
  assert.equal(response.body.user_id, "user-1");
  assert.equal(response.body.amount, 100);
  assert.equal(response.body.balance, 500);
  assert.equal(response.body.ledger_id, "ledger-1");
  assert.deepEqual(capturedCommand, {
    userId: "user-1",
    amount: 100,
    occurredAt: new Date("2026-03-05T10:00:00.000Z"),
  });
});

test("wallet deposit controller maps domain errors", async () => {
  const handler = createPostWalletDepositHandler({
    walletService: {
      topUpDeposit: async () => {
        throw new DomainNotFoundError(WALLET_NOT_FOUND_CODE, "Wallet not found");
      },
    },
    now: () => new Date("2026-03-05T10:00:00.000Z"),
  });

  const response = await parseResponse(
    await handler(
      new Request("https://example.com/api/wallet/deposit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-missing",
        },
        body: JSON.stringify({ amount: 100 }),
      }),
    ),
  );

  assert.equal(response.status, 404);
  assert.equal(response.errorCode, WALLET_NOT_FOUND_CODE);
  assert.equal(response.body.error_code, WALLET_NOT_FOUND_CODE);
});
