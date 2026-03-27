type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

type WalletLockRow = {
  id: string;
  balance: DecimalLike;
  locked_balance: DecimalLike;
};

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

async function normalizeMoney(value: number): Promise<number> {
  return Number(value.toFixed(2));
}

export async function ensureAuctionDepositLock(
  tx: any,
  input: {
    auctionId: string;
    companyId: string;
    userId: string;
    amount?: number;
  },
): Promise<{ kind: "locked" | "existing" } | { kind: "deposit_required" }> {
  // controlled via MIN_DEPOSIT_AED env var — set to 5000 in production
  const minDepositAed = Number(process.env.MIN_DEPOSIT_AED ?? 5000);
  const amount = await normalizeMoney(input.amount ?? minDepositAed);
  const existingLock = await tx.depositLock.findFirst({
    where: {
      auctionId: input.auctionId,
      companyId: input.companyId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (existingLock) {
    return {
      kind: "existing",
    };
  }

  const walletRows = await tx.$queryRaw<WalletLockRow[]>`
    SELECT id, balance, "lockedBalance" AS locked_balance
    FROM "Wallet"
    WHERE "userId" = ${input.userId}
    FOR UPDATE
  `;
  const wallet = walletRows[0];

  if (!wallet) {
    return {
      kind: "deposit_required",
    };
  }

  const balance = await toNumberValue(wallet.balance);
  const lockedBalance = await toNumberValue(wallet.locked_balance);
  const availableBalance = await normalizeMoney(balance - lockedBalance);

  if (availableBalance < amount) {
    return {
      kind: "deposit_required",
    };
  }

  const lock = await tx.depositLock.create({
    data: {
      auctionId: input.auctionId,
      companyId: input.companyId,
      walletId: wallet.id,
      amount,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  await tx.wallet.update({
    where: {
      id: wallet.id,
    },
    data: {
      lockedBalance: {
        increment: amount,
      },
    },
  });

  await tx.walletLedger.create({
    data: {
      walletId: wallet.id,
      type: "DEPOSIT_LOCK",
      amount,
      reference: lock.id,
    },
  });

  return {
    kind: "locked",
  };
}

export async function releaseAuctionDepositLocks(
  tx: any,
  input: {
    auctionId: string;
    winnerCompanyId?: string | null;
    reason: string;
  },
): Promise<{ releasedLockIds: string[] }> {
  const locks = await tx.depositLock.findMany({
    where: {
      auctionId: input.auctionId,
      status: "ACTIVE",
      ...(input.winnerCompanyId
        ? {
            NOT: {
              companyId: input.winnerCompanyId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      walletId: true,
      amount: true,
    },
  });

  const releasedLockIds: string[] = [];
  const releasedAt = new Date();

  for (const lock of locks) {
    const amount = await toNumberValue(lock.amount);

    if (lock.walletId) {
      await tx.wallet.updateMany({
        where: {
          id: lock.walletId,
          lockedBalance: {
            gte: amount,
          },
        },
        data: {
          lockedBalance: {
            decrement: amount,
          },
        },
      });

      await tx.walletLedger.create({
        data: {
          walletId: lock.walletId,
          type: "DEPOSIT_RELEASE",
          amount,
          reference: lock.id,
        },
      });
    }

    await tx.depositLock.update({
      where: {
        id: lock.id,
      },
      data: {
        status: "RELEASED",
        releasedAt,
        resolutionReason: input.reason,
      },
    });

    releasedLockIds.push(lock.id);
  }

  return {
    releasedLockIds,
  };
}

export async function createIssuedInvoice(
  tx: any,
  input: {
    auctionId: string;
    buyerCompanyId: string;
    sellerCompanyId: string;
    subtotal: number;
    dueAt: Date;
  },
): Promise<void> {
  const existingInvoice = await tx.invoice.findUnique({
    where: {
      auctionId: input.auctionId,
    },
    select: {
      id: true,
    },
  });

  if (!existingInvoice) {
    await tx.invoice.create({
      data: {
        auctionId: input.auctionId,
        buyerCompanyId: input.buyerCompanyId,
        sellerCompanyId: input.sellerCompanyId,
        subtotal: input.subtotal,
        commission: 0,
        vat: 0,
        total: input.subtotal,
        currency: "AED",
        dueAt: input.dueAt,
      },
    });
  }

  const existingDeadline = await tx.paymentDeadline.findFirst({
    where: {
      auctionId: input.auctionId,
      buyerCompanyId: input.buyerCompanyId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (!existingDeadline) {
    await tx.paymentDeadline.create({
      data: {
        auctionId: input.auctionId,
        buyerCompanyId: input.buyerCompanyId,
        dueAt: input.dueAt,
      },
    });
  }
}
