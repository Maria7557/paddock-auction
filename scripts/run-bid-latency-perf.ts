import { performance } from "node:perf_hooks";

import {
  createPlaceBidService,
  type PlaceBidCommand,
  type PlaceBidService,
} from "../src/modules/bidding/application/place_bid_service";
import { createPostBidHandler } from "../src/modules/bidding/transport/post_bid_handler";
import { createPgliteTransactionRunner } from "../tests/integration/helpers/pglite_sql_runner";
import { createMigratedTestDb } from "../tests/integration/helpers/migration_harness";

type PercentileSummary = {
  p50: number;
  p95: number;
  p99: number;
};

type ScenarioSummary = {
  scenario: string;
  requestCount: number;
  totalWallMs: number;
  statusCounts: Record<string, number>;
  endpointLatencyMs: PercentileSummary;
  componentLatencyMs: {
    rateLimitCheckMs: PercentileSummary;
    advisoryLockWaitMs: PercentileSummary;
    dbTransactionMs: PercentileSummary;
    walletLockMutationMs: PercentileSummary;
    bidInsertAuctionUpdateMs: PercentileSummary;
  };
};

type BidTimingSamples = {
  endpoint: number[];
  rateLimit: number[];
  advisoryLockWait: number[];
  dbTransaction: number[];
  walletLockMutation: number[];
  bidInsertAuctionUpdate: number[];
};

function toInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1),
  );

  return Number(sorted[index].toFixed(2));
}

function summarizePercentiles(values: number[]): PercentileSummary {
  return {
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
  };
}

function buildStatusCounts(statuses: number[]): Record<string, number> {
  return statuses.reduce<Record<string, number>>((accumulator, status) => {
    const key = String(status);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function buildRequest(
  payload: {
    auction_id: string;
    company_id: string;
    user_id: string;
    amount: number;
  },
  idempotencyKey: string,
): Request {
  return new Request("https://example.com/api/bids", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-forwarded-for": "203.0.113.11",
    },
    body: JSON.stringify(payload),
  });
}

async function insertAuction(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  input: {
    id: string;
    currentPrice: number;
    minIncrement: number;
  },
): Promise<void> {
  await query(
    `INSERT INTO auctions (
       id,
       vehicle_id,
       seller_company_id,
       state,
       current_price,
       min_increment,
       last_bid_sequence,
       starts_at,
       ends_at
     ) VALUES ($1, $2, $3, 'LIVE', $4, $5, 0, $6, $7)`,
    [
      input.id,
      `vehicle-${input.id}`,
      `seller-${input.id}`,
      input.currentPrice,
      input.minIncrement,
      "2026-03-01T00:00:00Z",
      "2026-03-02T00:00:00Z",
    ],
  );
}

async function insertWallet(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  input: {
    id: string;
    companyId: string;
    availableBalance: number;
  },
): Promise<void> {
  await query(
    `INSERT INTO deposit_wallets (
       id,
       company_id,
       currency,
       available_balance,
       locked_balance,
       pending_withdrawal_balance
     ) VALUES ($1, $2, 'USD', $3, 0, 0)`,
    [input.id, input.companyId, input.availableBalance],
  );
}

function createEmptyTimingSamples(): BidTimingSamples {
  return {
    endpoint: [],
    rateLimit: [],
    advisoryLockWait: [],
    dbTransaction: [],
    walletLockMutation: [],
    bidInsertAuctionUpdate: [],
  };
}

function createInstrumentedBidHandler(
  baseService: Pick<PlaceBidService, "placeBid">,
  now: Date,
  samples: BidTimingSamples,
): (request: Request) => Promise<Response> {
  const instrumentedService: Pick<PlaceBidService, "placeBid"> = {
    placeBid: async (command: PlaceBidCommand) => {
      const result = await baseService.placeBid(command);
      samples.advisoryLockWait.push(result.timing.advisoryLockWaitMs);
      samples.dbTransaction.push(result.timing.dbTransactionMs);
      samples.walletLockMutation.push(result.timing.walletLockMutationMs);
      samples.bidInsertAuctionUpdate.push(result.timing.bidInsertAuctionUpdateMs);
      return result;
    },
  };

  return createPostBidHandler({
    placeBidService: instrumentedService,
    readDisableBiddingFlagFn: async () => ({
      disabled: false,
      key: "flags:disable_bidding",
      source: "default",
    }),
    incrementBidRateLimitsFn: async () => {
      const startedAt = performance.now();

      try {
        return {
          allowed: true,
          degraded: false,
          keys: {
            user: "rl:bid:user:perf",
            company: "rl:bid:company:perf",
            ip: "rl:bid:ip:perf",
          },
          limits: {
            user: 100_000,
            company: 100_000,
            ip: 100_000,
          },
          counts: {
            user: 1,
            company: 1,
            ip: 1,
          },
          exceeded: [],
        };
      } finally {
        samples.rateLimit.push(performance.now() - startedAt);
      }
    },
    incrementBidFloodConflictsFn: async () => ({ count: 0 }),
    bidFloodConflictThreshold: 999_999,
    now: () => now,
  });
}

function buildScenarioSummary(
  scenario: string,
  requestCount: number,
  totalWallMs: number,
  statuses: number[],
  samples: BidTimingSamples,
): ScenarioSummary {
  return {
    scenario,
    requestCount,
    totalWallMs: Number(totalWallMs.toFixed(2)),
    statusCounts: buildStatusCounts(statuses),
    endpointLatencyMs: summarizePercentiles(samples.endpoint),
    componentLatencyMs: {
      rateLimitCheckMs: summarizePercentiles(samples.rateLimit),
      advisoryLockWaitMs: summarizePercentiles(samples.advisoryLockWait),
      dbTransactionMs: summarizePercentiles(samples.dbTransaction),
      walletLockMutationMs: summarizePercentiles(samples.walletLockMutation),
      bidInsertAuctionUpdateMs: summarizePercentiles(samples.bidInsertAuctionUpdate),
    },
  };
}

async function runUniqueBidStormScenario(requestCount: number): Promise<ScenarioSummary> {
  const migratedDb = await createMigratedTestDb();
  const samples = createEmptyTimingSamples();
  const statuses: number[] = [];

  try {
    const { db } = migratedDb;
    await insertAuction(
      async (sql, params) => {
        await db.query(sql, params ?? []);
      },
      {
        id: "auction-perf-unique",
        currentPrice: 100,
        minIncrement: 1,
      },
    );

    for (let index = 1; index <= requestCount; index += 1) {
      await insertWallet(
        async (sql, params) => {
          await db.query(sql, params ?? []);
        },
        {
          id: `wallet-unique-${index}`,
          companyId: `company-unique-${index}`,
          availableBalance: 100_000,
        },
      );
    }

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250, 0);
    const handler = createInstrumentedBidHandler(
      placeBidService,
      new Date("2026-03-01T10:00:00Z"),
      samples,
    );

    const startedAt = performance.now();

    await Promise.all(
      Array.from({ length: requestCount }, (_, index) => index + 1).map(async (n) => {
        const request = buildRequest(
          {
            auction_id: "auction-perf-unique",
            company_id: `company-unique-${n}`,
            user_id: `user-unique-${n}`,
            amount: 101 + n,
          },
          `idem-unique-${n}`,
        );

        const requestStartedAt = performance.now();
        const response = await handler(request);
        const requestEndedAt = performance.now();
        samples.endpoint.push(requestEndedAt - requestStartedAt);
        statuses.push(response.status);
      }),
    );

    const endedAt = performance.now();

    return buildScenarioSummary(
      "unique-bid-storm-same-auction",
      requestCount,
      endedAt - startedAt,
      statuses,
      samples,
    );
  } finally {
    await migratedDb.cleanup();
  }
}

async function runReplayStormScenario(requestCount: number): Promise<ScenarioSummary> {
  const migratedDb = await createMigratedTestDb();
  const samples = createEmptyTimingSamples();
  const statuses: number[] = [];

  try {
    const { db } = migratedDb;
    await insertAuction(
      async (sql, params) => {
        await db.query(sql, params ?? []);
      },
      {
        id: "auction-perf-replay",
        currentPrice: 100,
        minIncrement: 1,
      },
    );

    await insertWallet(
      async (sql, params) => {
        await db.query(sql, params ?? []);
      },
      {
        id: "wallet-replay",
        companyId: "company-replay",
        availableBalance: 100_000,
      },
    );

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250, 0);
    const handler = createInstrumentedBidHandler(
      placeBidService,
      new Date("2026-03-01T11:00:00Z"),
      samples,
    );

    const initialResponse = await handler(
      buildRequest(
        {
          auction_id: "auction-perf-replay",
          company_id: "company-replay",
          user_id: "user-replay",
          amount: 110,
        },
        "idem-replay-storm",
      ),
    );

    if (initialResponse.status !== 201) {
      throw new Error(`Replay scenario warm-up failed with status ${initialResponse.status}`);
    }

    const startedAt = performance.now();

    await Promise.all(
      Array.from({ length: requestCount }).map(async () => {
        const request = buildRequest(
          {
            auction_id: "auction-perf-replay",
            company_id: "company-replay",
            user_id: "user-replay",
            amount: 110,
          },
          "idem-replay-storm",
        );

        const requestStartedAt = performance.now();
        const response = await handler(request);
        const requestEndedAt = performance.now();
        samples.endpoint.push(requestEndedAt - requestStartedAt);
        statuses.push(response.status);
      }),
    );

    const endedAt = performance.now();

    return buildScenarioSummary(
      "idempotency-replay-storm",
      requestCount,
      endedAt - startedAt,
      statuses,
      samples,
    );
  } finally {
    await migratedDb.cleanup();
  }
}

async function main(): Promise<void> {
  const uniqueRequestCount = toInt(process.env.BID_PERF_UNIQUE_REQUESTS, 4800);
  const replayRequestCount = toInt(process.env.BID_PERF_REPLAY_REQUESTS, 4800);

  const startedAt = performance.now();
  const uniqueScenario = await runUniqueBidStormScenario(uniqueRequestCount);
  const replayScenario = await runReplayStormScenario(replayRequestCount);
  const endedAt = performance.now();

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        totalRuntimeMs: Number((endedAt - startedAt).toFixed(2)),
        scenarios: [uniqueScenario, replayScenario],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Bid latency perf run failed", error);
  process.exitCode = 1;
});
