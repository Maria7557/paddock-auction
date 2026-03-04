const HISTOGRAM_METRIC_NAMES = ["bid_request_duration_ms", "bid_lock_wait_ms"] as const;

const COUNTER_METRIC_NAMES = [
  "bid_idempotency_conflict_total",
  "bid_rate_limited_total",
  "bid_flood_rejected_total",
  "wallet_negative_balance_attempt_total",
  "stripe_webhook_dedupe_total",
  "payment_deadline_default_total",
] as const;

export const guardrailMetricNames = {
  histogram: HISTOGRAM_METRIC_NAMES,
  counter: COUNTER_METRIC_NAMES,
} as const;

export type GuardrailHistogramMetricName = (typeof HISTOGRAM_METRIC_NAMES)[number];
export type GuardrailCounterMetricName = (typeof COUNTER_METRIC_NAMES)[number];

export type GuardrailMetricsSnapshot = {
  counters: Record<GuardrailCounterMetricName, number>;
  histograms: Record<GuardrailHistogramMetricName, number[]>;
};

function initializeCounters(): Record<GuardrailCounterMetricName, number> {
  return {
    bid_idempotency_conflict_total: 0,
    bid_rate_limited_total: 0,
    bid_flood_rejected_total: 0,
    wallet_negative_balance_attempt_total: 0,
    stripe_webhook_dedupe_total: 0,
    payment_deadline_default_total: 0,
  };
}

function initializeHistograms(): Record<GuardrailHistogramMetricName, number[]> {
  return {
    bid_request_duration_ms: [],
    bid_lock_wait_ms: [],
  };
}

class InMemoryGuardrailMetrics {
  private counters = initializeCounters();
  private histograms = initializeHistograms();

  incrementCounter(metricName: GuardrailCounterMetricName, value = 1): number {
    if (!Number.isFinite(value)) {
      throw new Error(`Counter increment must be finite. Received: ${value}`);
    }

    this.counters[metricName] += value;
    return this.counters[metricName];
  }

  observeHistogram(metricName: GuardrailHistogramMetricName, value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error(`Histogram value must be finite. Received: ${value}`);
    }

    this.histograms[metricName].push(value);
    return this.histograms[metricName].length;
  }

  snapshot(): GuardrailMetricsSnapshot {
    return {
      counters: { ...this.counters },
      histograms: {
        bid_request_duration_ms: [...this.histograms.bid_request_duration_ms],
        bid_lock_wait_ms: [...this.histograms.bid_lock_wait_ms],
      },
    };
  }

  reset(): void {
    this.counters = initializeCounters();
    this.histograms = initializeHistograms();
  }
}

export const guardrailMetrics = new InMemoryGuardrailMetrics();

export function incrementGuardrailCounter(
  metricName: GuardrailCounterMetricName,
  value = 1,
): number {
  return guardrailMetrics.incrementCounter(metricName, value);
}

export function observeGuardrailHistogram(
  metricName: GuardrailHistogramMetricName,
  value: number,
): number {
  return guardrailMetrics.observeHistogram(metricName, value);
}
