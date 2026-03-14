import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, type Wallet, type WalletLedger } from "@prisma/client";

import { createWalletRepository, type WalletRepositoryClient } from "./wallet_repository";

type WalletOverrides = Partial<Omit<Wallet, "balance" | "lockedBalance">> & {
  balance?: Prisma.Decimal | number | string;
  lockedBalance?: Prisma.Decimal | number | string;
};

type WalletLedgerOverrides = Partial<Omit<WalletLedger, "amount">> & {
  amount?: Prisma.Decimal | number | string;
};

function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  return new Prisma.Decimal(value);
}

function buildWallet(overrides: WalletOverrides = {}): Wallet {
  const {
    balance,
    lockedBalance,
    createdAt,
    updatedAt,
    ...rest
  } = overrides;

  return {
    id: "wallet-1",
    userId: "user-1",
    balance: toDecimal(balance ?? 100),
    lockedBalance: toDecimal(lockedBalance ?? 20),
    createdAt: createdAt ?? new Date("2026-03-05T10:00:00.000Z"),
    updatedAt: updatedAt ?? new Date("2026-03-05T10:00:00.000Z"),
    ...rest,
  };
}

function buildLedger(overrides: WalletLedgerOverrides = {}): WalletLedger {
  const { amount, createdAt, ...rest } = overrides;

  return {
    id: "ledger-1",
    walletId: "wallet-1",
    type: "DEPOSIT_TOPUP",
    amount: toDecimal(amount ?? 100),
    reference: null,
    createdAt: createdAt ?? new Date("2026-03-05T10:01:00.000Z"),
    ...rest,
  };
}

test("createWalletForUser creates a wallet linked to the user", async () => {
  let capturedArgs: unknown;

  const client: WalletRepositoryClient = {
    wallet: {
      create: async (args) => {
        capturedArgs = args;
        return buildWallet({ userId: "user-create" });
      },
      findUnique: async () => null,
      update: async () => buildWallet(),
    },
    walletLedger: {
      create: async () => buildLedger(),
    },
  };

  const repository = createWalletRepository(client);
  const created = await repository.createWalletForUser("user-create");

  assert.equal(created.userId, "user-create");
  assert.deepEqual(capturedArgs, {
    data: {
      user: {
        connect: {
          id: "user-create",
        },
      },
    },
  });
});

test("getWalletByUserId queries by unique userId", async () => {
  let capturedArgs: unknown;

  const client: WalletRepositoryClient = {
    wallet: {
      create: async () => buildWallet(),
      findUnique: async (args) => {
        capturedArgs = args;
        return buildWallet({ userId: "user-find" });
      },
      update: async () => buildWallet(),
    },
    walletLedger: {
      create: async () => buildLedger(),
    },
  };

  const repository = createWalletRepository(client);
  const wallet = await repository.getWalletByUserId("user-find");

  assert.equal(wallet?.userId, "user-find");
  assert.deepEqual(capturedArgs, {
    where: {
      userId: "user-find",
    },
  });
});

test("addLedgerEntry writes ledger row and normalizes missing reference to null", async () => {
  let capturedArgs: unknown;

  const client: WalletRepositoryClient = {
    wallet: {
      create: async () => buildWallet(),
      findUnique: async () => buildWallet(),
      update: async () => buildWallet(),
    },
    walletLedger: {
      create: async (args) => {
        capturedArgs = args;
        return buildLedger({ walletId: "wallet-ledger", type: "DEPOSIT_LOCK", amount: 55 });
      },
    },
  };

  const repository = createWalletRepository(client);
  const ledger = await repository.addLedgerEntry({
    walletId: "wallet-ledger",
    type: "DEPOSIT_LOCK",
    amount: 55,
  });

  assert.equal(ledger.walletId, "wallet-ledger");
  assert.equal(ledger.type, "DEPOSIT_LOCK");
  assert.equal(Number(ledger.amount), 55);
  assert.deepEqual(capturedArgs, {
    data: {
      wallet: {
        connect: {
          id: "wallet-ledger",
        },
      },
      type: "DEPOSIT_LOCK",
      amount: 55,
      reference: null,
    },
  });
});

test("addLedgerEntry rejects non-integer amount", async () => {
  const client: WalletRepositoryClient = {
    wallet: {
      create: async () => buildWallet(),
      findUnique: async () => buildWallet(),
      update: async () => buildWallet(),
    },
    walletLedger: {
      create: async () => buildLedger(),
    },
  };

  const repository = createWalletRepository(client);

  await assert.rejects(
    async () => {
      await repository.addLedgerEntry({
        walletId: "wallet-ledger",
        type: "DEPOSIT_TOPUP",
        amount: 10.5,
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /amount must be an integer/i);
      return true;
    },
  );
});

test("updateWalletBalance increments both balances by delta", async () => {
  let capturedArgs: unknown;

  const client: WalletRepositoryClient = {
    wallet: {
      create: async () => buildWallet(),
      findUnique: async () => buildWallet(),
      update: async (args) => {
        capturedArgs = args;
        return buildWallet({
          userId: "user-update",
          balance: 135,
          lockedBalance: 25,
        });
      },
    },
    walletLedger: {
      create: async () => buildLedger(),
    },
  };

  const repository = createWalletRepository(client);
  const updated = await repository.updateWalletBalance({
    userId: "user-update",
    balanceDelta: 35,
    lockedBalanceDelta: 5,
  });

  assert.equal(Number(updated.balance), 135);
  assert.equal(Number(updated.lockedBalance), 25);
  assert.deepEqual(capturedArgs, {
    where: {
      userId: "user-update",
    },
    data: {
      balance: {
        increment: 35,
      },
      lockedBalance: {
        increment: 5,
      },
    },
  });
});

test("updateWalletBalance rejects non-integer deltas", async () => {
  const client: WalletRepositoryClient = {
    wallet: {
      create: async () => buildWallet(),
      findUnique: async () => buildWallet(),
      update: async () => buildWallet(),
    },
    walletLedger: {
      create: async () => buildLedger(),
    },
  };

  const repository = createWalletRepository(client);

  await assert.rejects(
    async () => {
      await repository.updateWalletBalance({
        userId: "user-update",
        balanceDelta: 1,
        lockedBalanceDelta: 1.25,
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /lockedBalanceDelta must be an integer/i);
      return true;
    },
  );
});
