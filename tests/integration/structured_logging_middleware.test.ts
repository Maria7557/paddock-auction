import assert from "node:assert/strict";
import test from "node:test";

import {
  withStructuredMutationLogging,
  type StructuredMutationLogEntry,
} from "../../src/modules/platform/transport/structured_logging_middleware";

test("structured logging middleware logs required fields on rejected mutation", async () => {
  const infoLogs: string[] = [];
  const warnLogs: string[] = [];
  const errorLogs: string[] = [];

  const logger = {
    info: (payload: string) => {
      infoLogs.push(payload);
    },
    warn: (payload: string) => {
      warnLogs.push(payload);
    },
    error: (payload: string) => {
      errorLogs.push(payload);
    },
  };

  const wrappedHandler = withStructuredMutationLogging(async () => {
    return new Response(JSON.stringify({ error_code: "BID_RATE_LIMITED" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "x-error-code": "BID_RATE_LIMITED",
      },
    });
  }, logger);

  const response = await wrappedHandler(
    new Request("https://example.com/api/bids?user_id=user-query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idem-123",
        "x-correlation-id": "corr-123",
        "x-company-id": "company-header",
      },
      body: JSON.stringify({ auction_id: "auction-body", user_id: "user-body" }),
    }),
    {},
  );

  assert.equal(response.headers.get("x-correlation-id"), "corr-123");
  assert.equal(infoLogs.length, 0);
  assert.equal(errorLogs.length, 0);
  assert.equal(warnLogs.length, 1);

  const entry = JSON.parse(warnLogs[0]) as StructuredMutationLogEntry;

  assert.equal(entry.correlation_id, "corr-123");
  assert.equal(entry.idempotency_key, "idem-123");
  assert.equal(entry.auction_id, "auction-body");
  assert.equal(entry.company_id, "company-header");
  assert.equal(entry.user_id, "user-query");
  assert.equal(entry.route, "/api/bids");
  assert.equal(entry.result, "rejected");
  assert.equal(entry.error_code, "BID_RATE_LIMITED");
  assert.ok(entry.duration_ms >= 0);
});

test("structured logging middleware logs failed result when handler throws", async () => {
  const errorLogs: string[] = [];

  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: (payload: string) => {
      errorLogs.push(payload);
    },
  };

  const wrappedHandler = withStructuredMutationLogging(async () => {
    throw new Error("unexpected");
  }, logger);

  await assert.rejects(async () => {
    await wrappedHandler(
      new Request("https://example.com/api/bids", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ user_id: "user-1" }),
      }),
      {},
    );
  });

  assert.equal(errorLogs.length, 1);

  const entry = JSON.parse(errorLogs[0]) as StructuredMutationLogEntry;
  assert.equal(entry.result, "failed");
  assert.equal(entry.route, "/api/bids");
  assert.equal(entry.user_id, "user-1");
  assert.equal(entry.error_code, "UNHANDLED_EXCEPTION");
});
