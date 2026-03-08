import assert from "node:assert/strict";
import test from "node:test";

import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import {
  closeDueAuctions,
  createAuctionLifecycleCronScheduler,
  startDueAuctions,
} from "./auction_scheduler";

function createRunnerWithTx(tx: SqlClient): SqlTransactionRunner {
  return {
    async transaction<T>(handler: (transactionClient: SqlClient) => Promise<T>): Promise<T> {
      return handler(tx);
    },
  };
}

test("startDueAuctions transitions due SCHEDULED auctions to LIVE", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  let selectCalls = 0;

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ sql, params });

      if (sql.includes("FROM auctions") && sql.includes("FOR UPDATE SKIP LOCKED")) {
        selectCalls += 1;

        if (selectCalls === 1) {
          return {
            rows: [{ id: "auction-start-1", version: 2 }] as unknown as T[],
          };
        }

        return { rows: [] };
      }

      if (sql.startsWith("UPDATE auctions")) {
        return { rows: [] };
      }

      if (sql.startsWith("INSERT INTO auction_state_transitions")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const occurredAt = new Date("2026-03-06T10:00:00.000Z");
  const result = await startDueAuctions(createRunnerWithTx(tx), {
    occurredAt,
    batchSize: 10,
  });

  assert.equal(result.processedCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].auctionId, "auction-start-1");
  assert.equal(result.items[0].fromState, "SCHEDULED");
  assert.equal(result.items[0].toState, "LIVE");
  assert.equal(result.items[0].version, 3);

  const updateQuery = queries.find((query) => query.sql.startsWith("UPDATE auctions"));
  assert.ok(updateQuery);
  assert.equal(updateQuery?.params[0], "auction-start-1");
  assert.equal(updateQuery?.params[1], "LIVE");
});

test("closeDueAuctions transitions due LIVE auctions to ENDED and sets closed_at", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  let selectCalls = 0;

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ sql, params });

      if (sql.includes("FROM auctions") && sql.includes("FOR UPDATE SKIP LOCKED")) {
        selectCalls += 1;

        if (selectCalls === 1) {
          return {
            rows: [{ id: "auction-close-1", version: 0 }] as unknown as T[],
          };
        }

        return { rows: [] };
      }

      if (sql.startsWith("UPDATE auctions")) {
        return { rows: [] };
      }

      if (sql.startsWith("INSERT INTO auction_state_transitions")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const occurredAt = new Date("2026-03-06T11:00:00.000Z");
  const result = await closeDueAuctions(createRunnerWithTx(tx), {
    occurredAt,
    batchSize: 10,
  });

  assert.equal(result.processedCount, 1);
  assert.equal(result.items[0].fromState, "LIVE");
  assert.equal(result.items[0].toState, "ENDED");
  assert.equal(result.items[0].version, 1);

  const updateQuery = queries.find((query) => query.sql.startsWith("UPDATE auctions"));
  assert.ok(updateQuery);
  assert.match(updateQuery?.sql ?? "", /closed_at = COALESCE\(closed_at, \$4::timestamptz\)/);
  assert.equal(updateQuery?.params[1], "ENDED");
});

test("createAuctionLifecycleCronScheduler wires start and close jobs", async () => {
  const scheduledJobs: Array<{
    cronExpression: string;
    handler: () => void | Promise<void>;
    startCalls: number;
    stopCalls: number;
  }> = [];

  const scheduler = createAuctionLifecycleCronScheduler({
    scheduler: {
      startDueAuctions: async () => ({ processedCount: 0, items: [] }),
      closeDueAuctions: async () => ({ processedCount: 0, items: [] }),
    },
    now: () => new Date("2026-03-06T12:00:00.000Z"),
    batchSize: 25,
    startCronExpression: "*/2 * * * *",
    closeCronExpression: "*/3 * * * *",
    scheduleTask: (cronExpression, handler) => {
      const job = {
        cronExpression,
        handler,
        startCalls: 0,
        stopCalls: 0,
      };

      scheduledJobs.push(job);

      return {
        start(): void {
          job.startCalls += 1;
        },
        stop(): void {
          job.stopCalls += 1;
        },
      };
    },
  });

  assert.equal(scheduledJobs.length, 2);
  assert.equal(scheduledJobs[0].cronExpression, "*/2 * * * *");
  assert.equal(scheduledJobs[1].cronExpression, "*/3 * * * *");

  scheduler.start();
  assert.equal(scheduledJobs[0].startCalls, 1);
  assert.equal(scheduledJobs[1].startCalls, 1);

  await Promise.resolve(scheduledJobs[0].handler());
  await Promise.resolve(scheduledJobs[1].handler());

  scheduler.stop();
  assert.equal(scheduledJobs[0].stopCalls, 1);
  assert.equal(scheduledJobs[1].stopCalls, 1);
});
