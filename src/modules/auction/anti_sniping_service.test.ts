import assert from "node:assert/strict";
import test from "node:test";

import type { SqlClient, SqlRow } from "../../lib/sql_contract";
import {
  ANTI_SNIPING_EXTENSION_SECONDS,
  applyAntiSnipingExtension,
  shouldExtendAuctionForBid,
} from "./anti_sniping_service";

test("shouldExtendAuctionForBid returns true when bid is in the last 120 seconds", () => {
  const currentEndsAt = new Date("2026-03-07T10:01:59.000Z");
  const occurredAt = new Date("2026-03-07T10:00:00.000Z");

  assert.equal(shouldExtendAuctionForBid(currentEndsAt, occurredAt), true);
});

test("shouldExtendAuctionForBid returns false when remaining time is 120 seconds or more", () => {
  const endsAtExactly120 = new Date("2026-03-07T10:02:00.000Z");
  const occurredAt = new Date("2026-03-07T10:00:00.000Z");

  assert.equal(shouldExtendAuctionForBid(endsAtExactly120, occurredAt), false);

  const endsAtEarlier = new Date("2026-03-07T10:05:00.000Z");
  assert.equal(shouldExtendAuctionForBid(endsAtEarlier, occurredAt), false);
});

test("applyAntiSnipingExtension extends auction by 120 seconds when bid is in final window", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
      queries.push({ sql, params });

      if (sql.startsWith("UPDATE auctions")) {
        return {
          rows: [{ ends_at: "2026-03-07T10:03:30.000Z" }] as unknown as T[],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const result = await applyAntiSnipingExtension(tx, {
    auctionId: "auction-anti-snipe-1",
    currentEndsAt: new Date("2026-03-07T10:01:30.000Z"),
    occurredAt: new Date("2026-03-07T10:00:00.000Z"),
  });

  assert.equal(result.extended, true);
  assert.equal(result.extensionSeconds, ANTI_SNIPING_EXTENSION_SECONDS);
  assert.equal(result.previousEndsAt.toISOString(), "2026-03-07T10:01:30.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-03-07T10:03:30.000Z");
  assert.equal(queries.length, 1);
  assert.equal(queries[0].params[0], "auction-anti-snipe-1");
  assert.equal(queries[0].params[1], 120);
});

test("applyAntiSnipingExtension does not update auction when bid is earlier than last 120 seconds", async () => {
  let queryCalls = 0;

  const tx: SqlClient = {
    async query<T extends SqlRow = SqlRow>(): Promise<{ rows: T[] }> {
      queryCalls += 1;
      return { rows: [] };
    },
  };

  const result = await applyAntiSnipingExtension(tx, {
    auctionId: "auction-anti-snipe-2",
    currentEndsAt: new Date("2026-03-07T10:05:00.000Z"),
    occurredAt: new Date("2026-03-07T10:00:00.000Z"),
  });

  assert.equal(result.extended, false);
  assert.equal(result.endsAt.toISOString(), "2026-03-07T10:05:00.000Z");
  assert.equal(queryCalls, 0);
});
