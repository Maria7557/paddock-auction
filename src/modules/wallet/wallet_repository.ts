export type LedgerType = string;

export type Wallet = {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type WalletLedger = {
  id: string;
  walletId: string;
  type: LedgerType;
  amount: number;
  reference?: string | null;
  createdAt?: Date;
};

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
  create(args: {
    data: {
      user: {
        connect: {
          id: string;
        };
      };
    };
  }): Promise<Wallet>;
  findUnique(args: {
    where: {
      userId: string;
    };
  }): Promise<Wallet | null>;
  update(args: {
    where: {
      userId: string;
    };
    data: {
      balance: {
        increment: number;
      };
      lockedBalance: {
        increment: number;
      };
    };
  }): Promise<Wallet>;
};

type WalletLedgerModel = {
  create(args: {
    data: {
      wallet: {
        connect: {
          id: string;
        };
      };
      type: LedgerType;
      amount: number;
      reference: string | null;
    };
  }): Promise<WalletLedger>;
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

function requireDbClient(dbClient: WalletRepositoryClient | null): WalletRepositoryClient {
  if (!dbClient) {
    throw new Error("Wallet persistence has been moved out of the Next.js frontend.");
  }

  return dbClient;
}

export function createWalletRepository(dbClient: WalletRepositoryClient | null = null): WalletRepository {
  return {
    async createWalletForUser(userId: string): Promise<Wallet> {
      return requireDbClient(dbClient).wallet.create({
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
      return requireDbClient(dbClient).wallet.findUnique({
        where: {
          userId,
        },
      });
    },

    async addLedgerEntry(input: AddLedgerEntryInput): Promise<WalletLedger> {
      assertInteger(input.amount, "amount");

      return requireDbClient(dbClient).walletLedger.create({
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

      return requireDbClient(dbClient).wallet.update({
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
