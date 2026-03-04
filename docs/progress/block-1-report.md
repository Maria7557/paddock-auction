# Block 1 Report - Runtime Guardrails Foundation

## Scope Completed
Implemented Block 1 foundation guardrails only (no bid/payment business flows), aligned to:
- `docs/architecture/CONTROLLED_MVP_AUCTION_EXECUTION_PLAN.md`
- `docs/architecture/FAST_MVP_LAUNCH_PATCH.md`

## Files Changed
- `.env.example`
- `package.json`
- `package-lock.json`
- `src/lib/env.ts`
- `src/modules/platform/infrastructure/redis/client.ts`
- `src/modules/platform/application/bid_guardrails.ts`
- `src/modules/platform/transport/structured_logging_middleware.ts`
- `src/modules/platform/domain/metrics.ts`
- `src/modules/platform/application/bid_guardrails.test.ts`
- `src/modules/platform/domain/metrics.test.ts`
- `tests/integration/structured_logging_middleware.test.ts`
- `tests/e2e/platform_guardrails_smoke.test.ts`
- `docs/progress/block-1-report.md`

## What Was Implemented

### 1) Runtime Guardrails Foundation

#### Redis client utilities
- Added lazy Redis client utility in `src/modules/platform/infrastructure/redis/client.ts`.
- Added runtime key helpers for:
  - `flags:disable_bidding`
  - `rl:bid:user:{user_id}`
  - `rl:bid:company:{company_id}`
  - `rl:bid:ip:{ip}`
- Implemented fail-fast connection behavior (`connectTimeout` + no reconnect loop) to avoid request stalls during Redis outage.
- Added safe fallback accessor (`getRedisClientOrNull`) for degraded mode paths.

#### Feature flag reader (`flags:disable_bidding`)
- Added `readDisableBiddingFlag` in `src/modules/platform/application/bid_guardrails.ts`.
- Behavior:
  - Reads `flags:disable_bidding` from Redis.
  - Accepts only `true|false` string values.
  - Falls back to `DISABLE_BIDDING_DEFAULT` when Redis is unavailable, missing value, or invalid value.

#### Rate-limit primitives
- Added `incrementBidRateLimits` in `src/modules/platform/application/bid_guardrails.ts`.
- Uses single Lua script to atomically increment the 3 counters and set `EXPIRE` on first hit (10s window).
- Covers required key contracts:
  - `rl:bid:user:{user_id}`
  - `rl:bid:company:{company_id}`
  - `rl:bid:ip:{ip}`
- Returns structured decision with:
  - `allowed`
  - `degraded`
  - `limits`
  - `counts`
  - `exceeded` scopes

#### Structured logging middleware
- Added `withStructuredMutationLogging` in `src/modules/platform/transport/structured_logging_middleware.ts`.
- Logs required fields for mutation methods (`POST|PUT|PATCH|DELETE`):
  - `correlation_id`
  - `idempotency_key` (if present)
  - `auction_id` (if present)
  - `company_id` (if present)
  - `user_id` (if present)
  - `route`
  - `result` (`success|rejected|failed`)
  - `error_code` (if present)
  - `duration_ms`
- Extracts optional entity fields from query/header/body JSON.
- Propagates correlation id to response header (`x-correlation-id`).

#### Metrics primitives (exact names)
- Added in-memory metric primitives in `src/modules/platform/domain/metrics.ts`.
- Exact metric names implemented:
  - `bid_request_duration_ms`
  - `bid_idempotency_conflict_total`
  - `bid_rate_limited_total`
  - `bid_flood_rejected_total`
  - `bid_lock_wait_ms`
  - `wallet_negative_balance_attempt_total`
  - `stripe_webhook_dedupe_total`
  - `payment_deadline_default_total`
- Exposed counter increment and histogram observe helpers plus snapshot/reset.

### 2) Package Scripts Added
Added missing scripts in `package.json`:
- `typecheck`
- `test`
- `test:unit`
- `test:integration`
- `test:e2e`

## Key Design Decisions
1. Keep guardrails in `src/modules/platform/**` as cross-cutting foundation (no business endpoint wiring in Block 1).
2. Redis failures are fail-open for these primitives (degraded mode) to preserve MVP availability while still enabling guardrails when Redis is healthy.
3. Rate-limit increments are done in one Lua script to keep multi-key counter updates atomic.
4. Logging middleware implemented as a transport wrapper function to be applied to mutation handlers in next blocks, instead of introducing partial app-wide middleware that cannot reliably log final result/duration.
5. Metrics are in-memory primitives for fast MVP bootstrap, with exact metric contract ready for later sink/export integration.

## Commands Executed
- `pwd && ls -la`
- `rg --files docs/architecture`
- `sed -n '1,260p' docs/architecture/CONTROLLED_MVP_AUCTION_EXECUTION_PLAN.md`
- `sed -n '1,260p' docs/architecture/FAST_MVP_LAUNCH_PATCH.md`
- `sed -n '1,260p' docs/architecture/TECH_RULES.md`
- `find src -maxdepth 6 -type f | sort`
- `cat package.json`
- `npm install`
- `npm install -D tsx`
- `npm run lint`
- `npm run typecheck`
- `npm run test`

## Validation Status
- Lint: pass
- Typecheck: pass
- Unit tests: pass
- Integration tests: pass
- E2E tests: pass

## Current Gaps for Next Block
1. No business flow wiring yet:
- Guardrails are implemented but not yet integrated into `POST /api/bids` and other mutation endpoints.

2. Metrics export not yet wired:
- Primitives exist, but no `/api/internal/metrics` endpoint or external sink/export adapter is added yet.

3. No Stripe webhook guard/business behavior yet:
- `stripe_webhook_dedupe_total` metric primitive exists, but webhook dedupe and invoice status guard logic are deferred.

4. No bid flood conflict counter wiring yet:
- Flood rejection metric primitive exists, but contention classification and `flood:bid:auction:*` runtime behavior will be implemented in bid transaction flow block.

5. No production observability backend yet:
- Structured logs are emitted via JSON console logger; centralized ingestion/parsing config is not part of Block 1.
