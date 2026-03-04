# Fast MVP Launch Patch (v1.1)

This patch applies to the current fast MVP plan and adds only launch-critical controls without expanding scope.

## 1. Decision on Proposed Additions

All 6 proposals are accepted and included:

1. `Rate limiting` on bid endpoint: required.
2. `Bid flood protection`: required.
3. `Baseline monitoring`: required.
4. `Double webhook race guard`: required.
5. `Simple circuit breaker`: required.
6. `Structured logging minimum`: required.

No deferred scope is reintroduced (still no settlement module, no double-entry ledger, no outbox worker, no reconciliation automation, no multi-approval, no payout engine, no advanced compliance orchestration).

## 2. Exact Additions (No Schema Expansion)

## 2.1 Redis keys (new runtime contract)

- `flags:disable_bidding` (string `true|false`, TTL none)
- `rl:bid:user:{user_id}` (counter, TTL 10s)
- `rl:bid:company:{company_id}` (counter, TTL 10s)
- `rl:bid:ip:{ip}` (counter, TTL 10s)
- `flood:bid:auction:{auction_id}:conflicts` (counter, TTL 10s)

## 2.2 Environment variables (exact)

- `BID_LIMIT_USER_PER_10S=15`
- `BID_LIMIT_COMPANY_PER_10S=20`
- `BID_LIMIT_IP_PER_10S=60`
- `BID_FLOOD_CONFLICT_THRESHOLD_10S=50`
- `BID_LOCK_TIMEOUT_MS=250`
- `BID_PG_RETRY_MAX=2`
- `DISABLE_BIDDING_DEFAULT=false`
- `BID_ERROR_RATE_BREAKER_THRESHOLD_PCT=8`

## 2.3 Monitoring metrics (exact names)

- `bid_request_duration_ms` (histogram)
- `bid_idempotency_conflict_total` (counter)
- `bid_rate_limited_total` (counter)
- `bid_flood_rejected_total` (counter)
- `bid_lock_wait_ms` (histogram)
- `wallet_negative_balance_attempt_total` (counter)
- `stripe_webhook_dedupe_total` (counter)
- `payment_deadline_default_total` (counter)

## 2.4 Logging fields (required on every mutation request)

- `correlation_id`
- `idempotency_key` (if present)
- `auction_id` (if present)
- `company_id` (if present)
- `user_id`
- `route`
- `result` (`success|rejected|failed`)
- `error_code` (if any)
- `duration_ms`

## 3. Command Flow Deltas

## 3.1 `POST /api/bids` (prepend and contention behavior)

Add these steps **before idempotency write**:

1. Read `flags:disable_bidding`; if missing use `DISABLE_BIDDING_DEFAULT`.
2. If flag true: return `503` with code `BIDDING_DISABLED`.
3. Increment and validate rate limits (user/company/ip) atomically in Redis.
4. If any limit exceeded: return `429` with code `BID_RATE_LIMITED`.

Within transaction path:

5. Set `SET LOCAL lock_timeout = '${BID_LOCK_TIMEOUT_MS}ms'`.
6. On Postgres lock timeout/deadlock/serialization conflict:
7. Increment `flood:bid:auction:{auction_id}:conflicts`.
8. If counter >= `BID_FLOOD_CONFLICT_THRESHOLD_10S`, return `429` with code `BID_FLOOD_PROTECTED`.
9. Else return deterministic conflict (`409`) and never `500`.

Notes:

- Lock contention events must be logged with `auction_id`, `company_id`, `duration_ms`.
- `500` is reserved for unknown internal errors only.

## 3.2 `POST /api/stripe/webhook` (success guard)

In success-event branch, **before applying success mutation**:

1. Lock invoice row.
2. If `invoice.status != 'ISSUED'`: mark webhook processed, commit, return `200` (safe no-op).

Effect:

- Prevents duplicate success processing.
- Prevents out-of-order race from overriding `DEFAULTED`/`PAID` states.

## 3.3 Circuit breaker operations

Runtime runbook:

1. Alert if `bid endpoint error rate > BID_ERROR_RATE_BREAKER_THRESHOLD_PCT` for 5 minutes OR repeated wallet mutation failures.
2. Set `flags:disable_bidding=true`.
3. Verify bid endpoint returns `503`.
4. Investigate and recover.
5. Set `flags:disable_bidding=false`.

## 4. Sequential Build Plan (updated, still <= 9 steps)

1. Implement Redis client + rate-limit utility + runtime flag utility.
2. Add bid prechecks (`disable_bidding`, user/company/ip rate limits) and `429` responses.
3. Add bid contention handling (`lock_timeout`, conflict classification, flood threshold logic).
4. Add metrics instrumentation (`8` metrics listed above) and expose `/api/internal/metrics` (or existing metrics sink).
5. Add structured request logging middleware with required fields.
6. Add Stripe webhook success guard (`invoice.status == ISSUED` precondition).
7. Add/adjust tests:
   - rate limit hit returns `429`
   - 50+ conflict simulation returns `429` not `500`
   - duplicate webhook no-op
   - out-of-order webhook no-op when invoice not `ISSUED`
8. Add operational playbook snippets in plan docs (breaker on/off, metric thresholds).
9. Run full E2E for paid path and default/burn path with guardrails enabled.

## 5. Production Readiness Checklist Delta

Before public launch, all must be true:

1. Bid endpoint has active per-user/per-company/per-IP limits.
2. Flooded contention path returns `429`, not `500`.
3. Circuit breaker can disable bidding in runtime (`503`).
4. Monitoring dashboard contains all 8 baseline metrics.
5. Structured logs include required correlation and entity fields.
6. Stripe webhook dedupe works and success guard blocks non-`ISSUED` invoices.
7. Deadline default job increments `payment_deadline_default_total` and burns lock exactly once.

## 6. Known Residual Risks After Patch

1. Without ledger/outbox, financial traceability and async reliability are still reduced (known accepted scope trade-off).
2. Redis outage degrades rate limiting and flag reads; fallback policy must be fail-safe for bidding availability.
3. High-volume auctions can still produce elevated `409` rates, but no longer degrade into `500` storms under contention.
