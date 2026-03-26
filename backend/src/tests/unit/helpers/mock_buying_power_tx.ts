import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { vi } from "vitest";

type Decimal = Prisma.Decimal;

type WalletSeed = {
  companyId: string;
  availableBalance: Decimal | number | string;
  lockedBalance?: Decimal | number | string;
  pendingWithdrawalBalance?: Decimal | number | string;
};

type LockSeed = {
  companyId: string;
  amount: Decimal | number | string;
  buyingPowerCeiling?: Decimal | number | string;
  status?: "ACTIVE" | "RELEASED" | "BURNED";
};

type SummarySeed = {
  companyId: string;
  activeBidsTotal: Decimal | number | string;
};

type MockBuyingPowerTxInput = {
  wallets?: WalletSeed[];
  locks?: LockSeed[];
  summaries?: SummarySeed[];
};

type StoredWalletRow = {
  id: string;
  company_id: string;
  available_balance: Decimal;
  locked_balance: Decimal;
  pending_withdrawal_balance: Decimal;
};

type StoredLockRow = {
  id: string;
  company_id: string | null;
  auction_id: string | null;
  amount: Decimal;
  buying_power_ceiling: Decimal;
  status: "ACTIVE" | "RELEASED" | "BURNED";
  created_at: Date;
  released_at: Date | null;
  burned_at: Date | null;
};

type StoredSummaryRow = {
  id: string;
  company_id: string;
  active_bids_total: Decimal;
  updated_at: Date;
};

export function decimal(value: Decimal | number | string): Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function calculateBuyingPowerCeiling(amount: Decimal | number | string): Decimal {
  return decimal(amount).dividedBy(5_000).times(300_000);
}

function normalizeSql(query: TemplateStringsArray | Prisma.Sql): string {
  if (!("sql" in query)) {
    return query.join(" ");
  }

  return query.sql;
}

export function createMockBuyingPowerTx(input: MockBuyingPowerTxInput = {}) {
  const now = new Date("2026-03-25T00:00:00.000Z");
  const wallets = new Map<string, StoredWalletRow>();
  const locks = new Map<string, StoredLockRow>();
  const summaries = new Map<string, StoredSummaryRow>();
  const outboxEvents: Array<Record<string, unknown>> = [];

  for (const wallet of input.wallets ?? []) {
    wallets.set(wallet.companyId, {
      id: `wallet-${wallet.companyId}`,
      company_id: wallet.companyId,
      available_balance: decimal(wallet.availableBalance),
      locked_balance: decimal(wallet.lockedBalance ?? 0),
      pending_withdrawal_balance: decimal(wallet.pendingWithdrawalBalance ?? 0),
    });
  }

  for (const lock of input.locks ?? []) {
    locks.set(lock.companyId, {
      id: `lock-${lock.companyId}`,
      company_id: lock.companyId,
      auction_id: null,
      amount: decimal(lock.amount),
      buying_power_ceiling: decimal(
        lock.buyingPowerCeiling ?? calculateBuyingPowerCeiling(lock.amount),
      ),
      status: lock.status ?? "ACTIVE",
      created_at: now,
      released_at: null,
      burned_at: null,
    });
  }

  for (const summary of input.summaries ?? []) {
    summaries.set(summary.companyId, {
      id: `summary-${summary.companyId}`,
      company_id: summary.companyId,
      active_bids_total: decimal(summary.activeBidsTotal),
      updated_at: now,
    });
  }

  const tx = {
    $queryRaw: vi.fn(
      async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<unknown[]> => {
        const sql = normalizeSql(query);

        if (sql.includes("FROM deposit_wallets")) {
          const companyId = String(values[0]);
          const wallet = wallets.get(companyId);
          return wallet ? [wallet] : [];
        }

        if (sql.includes("FROM deposit_locks")) {
          const companyId = String(values[0]);
          const lock = locks.get(companyId);

          if (!lock || lock.status !== "ACTIVE") {
            return [];
          }

          return [lock];
        }

        if (sql.includes("FROM buyer_bid_summaries")) {
          const companyId = String(values[0]);
          const summary = summaries.get(companyId);
          return summary ? [summary] : [];
        }

        if (sql.includes("INSERT INTO deposit_locks")) {
          const [id, companyId, auctionId, amount, buyingPowerCeiling] = values;
          const createdLock: StoredLockRow = {
            id: String(id),
            company_id: String(companyId),
            auction_id: auctionId === null ? null : String(auctionId),
            amount: decimal(amount as Decimal | number | string),
            buying_power_ceiling: decimal(buyingPowerCeiling as Decimal | number | string),
            status: "ACTIVE",
            created_at: now,
            released_at: null,
            burned_at: null,
          };

          locks.set(createdLock.company_id ?? randomUUID(), createdLock);
          return [createdLock];
        }

        if (sql.includes("UPDATE buyer_bid_summaries")) {
          const [nextTotal, companyId] = values;
          const existingSummary = summaries.get(String(companyId));

          if (!existingSummary) {
            return [];
          }

          const updatedSummary: StoredSummaryRow = {
            ...existingSummary,
            active_bids_total: decimal(nextTotal as Decimal | number | string),
            updated_at: now,
          };

          summaries.set(updatedSummary.company_id, updatedSummary);
          return [updatedSummary];
        }

        throw new Error(`Unhandled $queryRaw SQL in test double: ${sql}`);
      },
    ),
    $executeRaw: vi.fn(
      async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number> => {
        const sql = normalizeSql(query);

        if (sql.includes("INSERT INTO buyer_bid_summaries")) {
          const [, companyId, activeBidsTotal] = values;
          const normalizedCompanyId = String(companyId);

          if (!summaries.has(normalizedCompanyId)) {
            summaries.set(normalizedCompanyId, {
              id: `summary-${normalizedCompanyId}`,
              company_id: normalizedCompanyId,
              active_bids_total: decimal(activeBidsTotal as Decimal | number | string),
              updated_at: now,
            });
          }

          return 1;
        }

        throw new Error(`Unhandled $executeRaw SQL in test double: ${sql}`);
      },
    ),
    outboxEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        outboxEvents.push(data);
        return data;
      }),
    },
    depositLock: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { companyId?: string; status?: string };
          data: { status?: "ACTIVE" | "RELEASED" | "BURNED"; releasedAt?: Date | null };
        }) => {
          let count = 0;

          for (const [companyId, lock] of locks.entries()) {
            if (where.companyId && lock.company_id !== where.companyId) {
              continue;
            }

            if (where.status && lock.status !== where.status) {
              continue;
            }

            locks.set(companyId, {
              ...lock,
              status: data.status ?? lock.status,
              released_at: data.releasedAt ?? lock.released_at,
            });
            count += 1;
          }

          return { count };
        },
      ),
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state: {
      wallets,
      locks,
      summaries,
      outboxEvents,
    },
  };
}
