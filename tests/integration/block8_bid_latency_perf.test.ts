import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createPlaceBidService } from "../../src/modules/bidding/application/place_bid_service";
import { createPostBidHandler } from "../../src/modules/bidding/transport/post_bid_handler";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";
import { createMigratedTestDb } from "./helpers/migration_harness";

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

test("bid endpoint perf scenario reports p50/p95/p99 and component timing breakdown", async () => {
  const requestCount = 300;
  const maxConcurrentRequests = 64;
  const migratedDb = await createMigratedTestDb();

  try {
    const { db } = migratedDb;

    await db.query(
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
        "auction-perf-test",
        "vehicle-perf-test",
        "seller-perf-test",
        100,
        1,
        "2026-03-01T00:00:00Z",
        "2026-03-02T00:00:00Z",
      ],
    );

    for (let index = 1; index <= requestCount; index += 1) {
      await db.query(
        `INSERT INTO deposit_wallets (
           id,
           company_id,
           currency,
           available_balance,
           locked_balance,
           pending_withdrawal_balance
         ) VALUES ($1, $2, 'USD', $3, 0, 0)`,
        [`wallet-perf-test-${index}`, `company-perf-test-${index}`, 10_000],
      );
    }

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250, 0);
    const endpointLatencyMs: number[] = [];
    const rateLimitCheckMs: number[] = [];
    const advisoryLockWaitMs: number[] = [];
    const dbTransactionMs: number[] = [];
    const depositLockMs: number[] = [];
    const walletUpdateMs: number[] = [];
    const bidInsertMs: number[] = [];
    const walletLockMutationMs: number[] = [];
    const bidInsertAuctionUpdateMs: number[] = [];

    const handler = createPostBidHandler({
      placeBidService: {
        placeBid: async (command) => {
          const result = await placeBidService.placeBid(command);
          advisoryLockWaitMs.push(result.timing.advisoryLockWaitMs);
          dbTransactionMs.push(result.timing.dbTransactionMs);
          depositLockMs.push(result.timing.depositLockMs);
          walletUpdateMs.push(result.timing.walletUpdateMs);
          bidInsertMs.push(result.timing.bidInsertMs);
          walletLockMutationMs.push(result.timing.walletLockMutationMs);
          bidInsertAuctionUpdateMs.push(result.timing.bidInsertAuctionUpdateMs);
          return result;
        },
      },
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
              user: "rl:bid:user:perf-test",
              company: "rl:bid:company:perf-test",
              ip: "rl:bid:ip:perf-test",
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
          rateLimitCheckMs.push(performance.now() - startedAt);
        }
      },
      incrementBidFloodConflictsFn: async () => ({ count: 0 }),
      bidFloodConflictThreshold: 999_999,
      now: () => new Date("2026-03-01T10:00:00Z"),
    });

    const runRequest = async (n: number): Promise<number> => {
      const request = new Request("https://example.com/api/bids", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `idem-perf-test-${n}`,
          "x-forwarded-for": "198.51.100.15",
        },
        body: JSON.stringify({
          auction_id: "auction-perf-test",
          company_id: `company-perf-test-${n}`,
          user_id: `user-perf-test-${n}`,
          amount: 101 + n,
        }),
      });

      const startedAt = performance.now();
      const response = await handler(request);
      const endedAt = performance.now();
      endpointLatencyMs.push(endedAt - startedAt);
      return response.status;
    };

    const responses: number[] = [];
    for (let offset = 0; offset < requestCount; offset += maxConcurrentRequests) {
      const batch = Array.from(
        { length: Math.min(maxConcurrentRequests, requestCount - offset) },
        (_, index) => offset + index + 1,
      );
      const batchResponses = await Promise.all(batch.map(async (n) => runRequest(n)));
      responses.push(...batchResponses);
    }

    for (const status of responses) {
      assert.equal(status, 201);
    }

    assert.equal(endpointLatencyMs.length, requestCount);
    assert.equal(rateLimitCheckMs.length, requestCount);
    assert.equal(advisoryLockWaitMs.length, requestCount);
    assert.equal(dbTransactionMs.length, requestCount);
    assert.equal(depositLockMs.length, requestCount);
    assert.equal(walletUpdateMs.length, requestCount);
    assert.equal(bidInsertMs.length, requestCount);
    assert.equal(walletLockMutationMs.length, requestCount);
    assert.equal(bidInsertAuctionUpdateMs.length, requestCount);

    const endpointP50 = quantile(endpointLatencyMs, 0.5);
    const endpointP95 = quantile(endpointLatencyMs, 0.95);
    const endpointP99 = quantile(endpointLatencyMs, 0.99);

    console.info(
      JSON.stringify(
        {
          metric: "bid_latency_perf_snapshot",
          requests: requestCount,
          max_concurrent_requests: maxConcurrentRequests,
          endpoint_ms: {
            p50: endpointP50,
            p95: endpointP95,
            p99: endpointP99,
          },
          rate_limit_check_ms: {
            p50: quantile(rateLimitCheckMs, 0.5),
            p95: quantile(rateLimitCheckMs, 0.95),
            p99: quantile(rateLimitCheckMs, 0.99),
          },
          advisory_lock_wait_ms: {
            p50: quantile(advisoryLockWaitMs, 0.5),
            p95: quantile(advisoryLockWaitMs, 0.95),
            p99: quantile(advisoryLockWaitMs, 0.99),
          },
          db_transaction_ms: {
            p50: quantile(dbTransactionMs, 0.5),
            p95: quantile(dbTransactionMs, 0.95),
            p99: quantile(dbTransactionMs, 0.99),
          },
          deposit_lock_ms: {
            p50: quantile(depositLockMs, 0.5),
            p95: quantile(depositLockMs, 0.95),
            p99: quantile(depositLockMs, 0.99),
          },
          wallet_update_ms: {
            p50: quantile(walletUpdateMs, 0.5),
            p95: quantile(walletUpdateMs, 0.95),
            p99: quantile(walletUpdateMs, 0.99),
          },
          bid_insert_ms: {
            p50: quantile(bidInsertMs, 0.5),
            p95: quantile(bidInsertMs, 0.95),
            p99: quantile(bidInsertMs, 0.99),
          },
          wallet_lock_mutation_ms: {
            p50: quantile(walletLockMutationMs, 0.5),
            p95: quantile(walletLockMutationMs, 0.95),
            p99: quantile(walletLockMutationMs, 0.99),
          },
          bid_insert_auction_update_ms: {
            p50: quantile(bidInsertAuctionUpdateMs, 0.5),
            p95: quantile(bidInsertAuctionUpdateMs, 0.95),
            p99: quantile(bidInsertAuctionUpdateMs, 0.99),
          },
        },
        null,
        2,
      ),
    );

    assert.ok(endpointP95 > 0);
    assert.ok(endpointP95 < 5_000);
    assert.ok(endpointP99 < 6_000);
  } finally {
    await migratedDb.cleanup();
  }
});
