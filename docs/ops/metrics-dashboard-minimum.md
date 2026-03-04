# Metrics Dashboard Minimum

## Required Metrics (exact names)
- `bid_request_duration_ms` (histogram)
- `bid_idempotency_conflict_total` (counter)
- `bid_rate_limited_total` (counter)
- `bid_flood_rejected_total` (counter)
- `bid_lock_wait_ms` (histogram)
- `wallet_negative_balance_attempt_total` (counter)
- `stripe_webhook_dedupe_total` (counter)
- `payment_deadline_default_total` (counter)

## Minimum Panels
1. Bid latency panel: p50/p95/p99 from `bid_request_duration_ms`
2. Bid lock wait panel: p50/p95/p99 from `bid_lock_wait_ms`
3. Bid reject counters: rate-limited, flood-rejected, idempotency conflicts
4. Financial safety counters: wallet negative attempts, payment deadline defaults
5. Stripe safety panel: webhook dedupe counter rate

## Minimum Alerts
- Bid error-rate alert: trigger when error percentage exceeds `BID_ERROR_RATE_BREAKER_THRESHOLD_PCT` for 5 minutes
- Flood-protection spike: sudden increase in `bid_flood_rejected_total`
- Wallet safety: any increase in `wallet_negative_balance_attempt_total`
- Deadline default spike: abnormal rise in `payment_deadline_default_total`

## Operational Interpretation
- Rising `bid_rate_limited_total` with stable latency usually indicates traffic abuse or misconfigured limits.
- Rising `bid_lock_wait_ms` and `bid_flood_rejected_total` indicates contention storm risk.
- Any increment in `wallet_negative_balance_attempt_total` is a high-priority integrity signal.
- `stripe_webhook_dedupe_total` should rise under retries, but payment state must remain idempotent.
