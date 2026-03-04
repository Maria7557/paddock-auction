# Block 4 Report - POST /api/bids Production-Fast Path

## Scope Completed
Implemented Block 4 only: full `POST /api/bids` path across transport -> application -> domain -> infrastructure, with prechecks, idempotency, atomic bid transaction, contention handling, and test coverage.

## Files Changed
- `app/api/bids/route.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260301201500_block4_bid_runtime_columns/migration.sql`
- `src/modules/platform/infrastructure/redis/client.ts`
- `src/modules/platform/application/bid_guardrails.ts`
- `src/modules/bidding/domain/bid_error_codes.ts`
- `src/modules/bidding/domain/bid_domain_errors.ts`
- `src/modules/bidding/domain/bid_request_hash.ts`
- `src/modules/bidding/domain/bid_request_hash.test.ts`
- `src/modules/bidding/application/place_bid_service.ts`
- `src/modules/bidding/infrastructure/bid_sql_repository.ts`
- `src/modules/bidding/transport/post_bid_handler.ts`
- `tests/integration/block2_database_contract.test.ts`
- `tests/integration/block4_bids_endpoint.test.ts`
- `docs/progress/block-4-report.md`

## Endpoint Behavior Implemented

### Transport and prechecks
- Route: `POST /api/bids`
- Required header: `Idempotency-Key`
- Canonical request hash: SHA-256 over deterministic payload `{auction_id, company_id, user_id, amount}` with amount normalized to 2 decimals.
- Prechecks before DB mutation:
  - `flags:disable_bidding` -> `503 BIDDING_DISABLED`
  - user/company/ip rate limits -> `429 BID_RATE_LIMITED`

### Idempotency
- Same key + same hash + stored response -> exact stored status/body replay.
- Same key + different hash -> `409 IDEMPOTENCY_CONFLICT`.
- In-progress same key/hash -> deterministic `409 IDEMPOTENCY_IN_PROGRESS`.

### Atomic bid transaction
In one DB transaction:
1. Advisory lock by `auction_id`.
2. `SET LOCAL lock_timeout` from `BID_LOCK_TIMEOUT_MS`.
3. Lock `auctions` row (`FOR UPDATE`).
4. Idempotency row read/insert (`bid_requests`).
5. Assert auction state is `LIVE`.
6. Validate `amount >= current_price + min_increment`.
7. Acquire/extend deposit lock and update wallet (`NO DEPOSIT = NO BID`).
8. Insert bid with next `sequence_no`.
9. Update auction (`highest_bid_id`, `current_price`, `version`, `last_bid_sequence`).
10. Persist `bid_requests` success/rejection response payload.

### Contention/flood handling
- SQL states classified as expected contention: `55P03`, `40P01`, `40001`.
- On expected contention:
  - increment Redis flood counter `flood:bid:auction:{auction_id}:conflicts` (10s window)
  - if threshold reached -> `429 BID_FLOOD_PROTECTED`
  - else -> deterministic `409 BID_CONTENTION_CONFLICT`
- No `500` returned for expected contention paths.

### Metrics/logging usage
- `bid_request_duration_ms` observed on all requests.
- `bid_lock_wait_ms` observed on transaction lock path and contention path.
- `bid_idempotency_conflict_total` incremented on hash mismatch conflict.
- `bid_rate_limited_total` incremented on precheck rate-limit rejection.
- `bid_flood_rejected_total` incremented on flood-protected rejection.
- Structured logging middleware applied on route via `withStructuredMutationLogging`.

## Tests Added/Adjusted
- `src/modules/bidding/domain/bid_request_hash.test.ts`
- `tests/integration/block4_bids_endpoint.test.ts`
- `tests/integration/block2_database_contract.test.ts` (migration list expectation updated)

Block 4 integration coverage includes:
1. idempotency replay success
2. idempotency hash mismatch -> `409`
3. rate-limited -> `429`
4. flood-protected -> `429` under conflict storm
5. concurrent bids produce unique monotonic `sequence_no`
6. insufficient deposit rejects with no bid insert

## Commands Executed
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run db:migrate:clean`

## Results
- All commands passed.
