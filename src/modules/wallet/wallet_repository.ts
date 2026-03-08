import type { LedgerType, Prisma, Wallet, WalletLedger } from "@prisma/client";

import prisma from "../../infrastructure/database/prisma";

export type AddLedgerEntryInput = {
  walletId: string;
  type: LedgerType;
  amount: number;
  reference?: string | null;
};

export type UpdateWalletBalanceInput = {
  userId: string;
  balanceDelta?: number;
  lockedBalanceDelta?: number;
};

type WalletModel = {
  create(args: Prisma.WalletCreateArgs): Promise<Wallet>;
  findUnique(args: Prisma.WalletFindUniqueArgs): Promise<Wallet | null>;
  update(args: Prisma.WalletUpdateArgs): Promise<Wallet>;
};

type WalletLedgerModel = {
  create(args: Prisma.WalletLedgerCreateArgs): Promise<WalletLedger>;
};

export type WalletRepositoryClient = {
  wallet: WalletModel;
  walletLedger: WalletLedgerModel;
};

export type WalletRepository = {
  createWalletForUser(userId: string): Promise<Wallet>;
  getWalletByUserId(userId: string): Promise<Wallet | null>;
  addLedgerEntry(input: AddLedgerEntryInput): Promise<WalletLedger>;
  updateWalletBalance(input: UpdateWalletBalanceInput): Promise<Wallet>;
};

function assertInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${fieldName} must be an integer`);
  }
}

export function createWalletRepository(dbClient: WalletRepositoryClient = prisma): WalletRepository {
  return {
    async createWalletForUser(userId: string): Promise<Wallet> {
      return dbClient.wallet.create({
        data: {
          user: {
            connect: {
              id: userId,
            },
          },
        },
      });
    },

    async getWalletByUserId(userId: string): Promise<Wallet | null> {
      return dbClient.wallet.findUnique({
        where: {
          userId,
        },
      });
    },

    async addLedgerEntry(input: AddLedgerEntryInput): Promise<WalletLedger> {
      assertInteger(input.amount, "amount");

      return dbClient.walletLedger.create({
        data: {
          wallet: {
            connect: {
              id: input.walletId,
            },
          },
          type: input.type,
          amount: input.amount,
          reference: input.reference ?? null,
        },
      });
    },

    async updateWalletBalance(input: UpdateWalletBalanceInput): Promise<Wallet> {
      const balanceDelta = input.balanceDelta ?? 0;
      const lockedBalanceDelta = input.lockedBalanceDelta ?? 0;

      assertInteger(balanceDelta, "balanceDelta");
      assertInteger(lockedBalanceDelta, "lockedBalanceDelta");

      return dbClient.wallet.update({
        where: {
          userId: input.userId,
        },
        data: {
          balance: {
            increment: balanceDelta,
          },
          lockedBalance: {
            increment: lockedBalanceDelta,
          },
        },
      });
    },
  };
}

export const walletRepository = createWalletRepository();
