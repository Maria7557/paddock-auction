# Fast MVP Launch Checklist

## Release Window
- Checklist run date: March 1, 2026 (UTC)
- Release scope: Fast MVP Blocks 1-6 + Day 4 hardening verification

## 1. Build and Test Gates (must all pass)
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`

## 2. Runtime Guardrails (must be validated)
- Bid rate limits active (`429 BID_RATE_LIMITED`)
- Bid flood protection active (`429 BID_FLOOD_PROTECTED`)
- Disable-bidding circuit breaker active (`503 BIDDING_DISABLED`)
- Stripe webhook dedupe active (duplicate event safe `200` no-op)
- Stripe webhook success guard active (`invoice.status != ISSUED` => safe `200` no-op)
- Deadline default enforcement active and one-time burn (`DEPOSIT_BURN` exactly once)

## 3. Environment and Runtime Configuration
- `DATABASE_URL` configured and reachable
- `REDIS_URL` configured and reachable
- `BID_LIMIT_USER_PER_10S` configured
- `BID_LIMIT_COMPANY_PER_10S` configured
- `BID_LIMIT_IP_PER_10S` configured
- `BID_FLOOD_CONFLICT_THRESHOLD_10S` configured
- `BID_LOCK_TIMEOUT_MS` configured
- `DISABLE_BIDDING_DEFAULT=false`
- `STRIPE_SECRET_KEY` configured in production
- `STRIPE_WEBHOOK_SIGNING_SECRET` configured in production

## 4. Post-Deploy Smoke Checks
- `/api/health` returns `200`
- `POST /api/bids` with breaker off does not return `503`
- `POST /api/bids` with breaker on returns `503 BIDDING_DISABLED`
- Duplicate Stripe webhook delivery returns `200` and does not duplicate state mutation
- Deadline enforcer endpoint runs and returns deterministic summary counts

## 5. Go/No-Go Criteria
- Go only if all build/test gates pass and all guardrails are validated.
- No-Go if any mutation path can produce duplicate financial mutation on replay/rerun.
