import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../../../lib/env";
import {
  bidGuardrailRuntime,
  incrementBidRateLimits,
  readDisableBiddingFlag,
} from "./bid_guardrails";

type MockRedisClient = {
  get?: (key: string) => Promise<string | null>;
  eval?: (
    script: string,
    options: { keys: string[]; arguments: string[] },
  ) => Promise<unknown>;
};

test("readDisableBiddingFlag falls back to default when redis is unavailable", async () => {
  const flag = await readDisableBiddingFlag(null);

  assert.equal(flag.disabled, env.DISABLE_BIDDING_DEFAULT);
  assert.equal(flag.source, "default");
  assert.equal(flag.key, "flags:disable_bidding");
});

test("readDisableBiddingFlag reads true from redis", async () => {
  const mockRedis: MockRedisClient = {
    get: async () => "true",
  };

  const flag = await readDisableBiddingFlag(mockRedis as never);

  assert.equal(flag.disabled, true);
  assert.equal(flag.source, "redis");
});

test("incrementBidRateLimits marks request as rejected when one scope exceeds limit", async () => {
  let capturedScript = "";
  let capturedOptions: { keys: string[]; arguments: string[] } | null = null;

  const mockRedis: MockRedisClient = {
    eval: async (script, options) => {
      capturedScript = script;
      capturedOptions = options;
      return [env.BID_LIMIT_USER_PER_10S + 1, 1, 1];
    },
  };

  const decision = await incrementBidRateLimits(
    {
      userId: "user-1",
      companyId: "company-1",
      ip: "127.0.0.1",
    },
    mockRedis as never,
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.degraded, false);
  assert.deepEqual(decision.exceeded, ["user"]);
  assert.equal(decision.counts?.user, env.BID_LIMIT_USER_PER_10S + 1);
  assert.equal(
    capturedOptions?.["arguments"][0],
    String(bidGuardrailRuntime.BID_RATE_LIMIT_WINDOW_SECONDS),
  );
  assert.ok(capturedScript.includes("INCR"));
  assert.deepEqual(capturedOptions?.["keys"], [
    "rl:bid:user:user-1",
    "rl:bid:company:company-1",
    "rl:bid:ip:127.0.0.1",
  ]);
});

test("incrementBidRateLimits degrades open when redis script fails", async () => {
  const mockRedis: MockRedisClient = {
    eval: async () => {
      throw new Error("redis unavailable");
    },
  };

  const decision = await incrementBidRateLimits(
    {
      userId: "u-2",
      companyId: "c-2",
      ip: "10.0.0.1",
    },
    mockRedis as never,
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.degraded, true);
  assert.equal(decision.counts, null);
  assert.deepEqual(decision.exceeded, []);
});
