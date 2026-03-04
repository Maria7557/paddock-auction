import assert from "node:assert/strict";
import test from "node:test";

import {
  guardrailMetricNames,
  guardrailMetrics,
  incrementGuardrailCounter,
  observeGuardrailHistogram,
} from "./metrics";

test("guardrail metric names match the required Block 1 contract", () => {
  assert.deepEqual(guardrailMetricNames.histogram, ["bid_request_duration_ms", "bid_lock_wait_ms"]);
  assert.deepEqual(guardrailMetricNames.counter, [
    "bid_idempotency_conflict_total",
    "bid_rate_limited_total",
    "bid_flood_rejected_total",
    "wallet_negative_balance_attempt_total",
    "stripe_webhook_dedupe_total",
    "payment_deadline_default_total",
  ]);
});

test("counter and histogram primitives persist values in memory", () => {
  guardrailMetrics.reset();

  incrementGuardrailCounter("bid_rate_limited_total");
  incrementGuardrailCounter("bid_rate_limited_total", 2);
  observeGuardrailHistogram("bid_request_duration_ms", 55);

  const snapshot = guardrailMetrics.snapshot();

  assert.equal(snapshot.counters.bid_rate_limited_total, 3);
  assert.deepEqual(snapshot.histograms.bid_request_duration_ms, [55]);
});

test("metrics primitives reject non-finite values", () => {
  guardrailMetrics.reset();

  assert.throws(() => incrementGuardrailCounter("bid_rate_limited_total", Number.NaN));
  assert.throws(() => observeGuardrailHistogram("bid_lock_wait_ms", Number.POSITIVE_INFINITY));
});
