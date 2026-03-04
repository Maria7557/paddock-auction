# Block 8 Report - Bid Latency Hardening

## Scope Completed
- Profiled bid endpoint latency with component timing breakdown.
- Implemented pragmatic latency hardening without re-architecting business flow.
- Preserved correctness guarantees (`NO DEPOSIT = NO BID`, idempotency semantics, atomic transaction behavior, rate-limit/flood protections).
- Added reproducible perf scenario runner and integration perf snapshot test.

## Perf Scenario Used
- Command: `npm run perf:bid-latency`
- Scenarios:
  - `unique-bid-storm-same-auction` (4,800 parallel unique bids)
  - `idempotency-replay-storm` (4,800 parallel replays after one successful warm-up)
- Runtime environment: local migrated PGlite database used by integration harness.

## Latency Breakdown (Measured)
From latest `npm run perf:bid-latency` run:

### Unique Bid Storm (4,800)
- Endpoint latency:
  - `p50=5553.96ms`
  - `p95=10288.13ms`
  - `p99=10707.98ms`
- Component breakdown:
  - `rateLimitCheckMs p95=0ms`
  - `advisoryLockWaitMs p95=1ms`
  - `dbTransactionMs p95=3ms`
  - `walletLockMutationMs p95=1ms`
  - `bidInsertAuctionUpdateMs p95=1ms`

### Idempotency Replay Storm (4,800)
- Endpoint latency:
  - `p50=1892.97ms`
  - `p95=3472.76ms`
  - `p99=3610.48ms`
- Component breakdown:
  - `rateLimitCheckMs p95=0ms`
  - `advisoryLockWaitMs p95=0ms`
  - `dbTransactionMs p95=1ms`
  - `walletLockMutationMs p95=0ms`
  - `bidInsertAuctionUpdateMs p95=0ms`

## Bottlenecks Identified
1. Lock timeout was configured after advisory lock acquisition, allowing long wait tails before contention classification.
2. Existing idempotency keys (replay/conflict) still traversed heavy lock path before short-circuit.
3. Wallet/lock mutation path issued avoidable round trips in the dominant first-bid path.

## Hardening Changes Implemented
1. **Lock timeout ordering fix**
   - Moved `SET LOCAL lock_timeout` before advisory lock acquisition.
2. **Idempotency fast-path**
   - Added upfront idempotency claim/read (`INSERT ... ON CONFLICT DO NOTHING`) before advisory/auction lock path.
   - Existing key replay/conflict now exits before heavy mutation locks.
3. **Wallet/lock round-trip reduction**
   - Optimistic active lock insert for first-bid path, fallback to existing-lock read only on unique conflict.
   - Kept atomic wallet + lock mutation behavior.
4. **Bounded contention retry activation**
   - Wired retry budget support via `BID_PG_RETRY_MAX` in default bid service construction.
5. **Perf instrumentation for profiling**
   - Added internal bid timing breakdown fields:
     - `advisoryLockWaitMs`
     - `dbTransactionMs`
     - `walletLockMutationMs`
     - `bidInsertAuctionUpdateMs`
   - Added perf runner reporting `p50/p95/p99`.

## Before vs After (p95)
Baseline captured before hardening on same dataset scale and request count.

| Scenario | Before p95 | After p95 | Delta |
|---|---:|---:|---:|
| unique-bid-storm-same-auction (4,800) | 13532.14ms | 10288.13ms | -3244.01ms (-23.97%) |
| idempotency-replay-storm (4,800) | 4739.76ms | 3472.76ms | -1267.00ms (-26.73%) |

## Correctness Guarantees Validation
- `NO DEPOSIT = NO BID`: validated by existing integration tests (`insufficient deposit rejects without bid insert`).
- Idempotency semantics: validated by existing replay/hash-mismatch integration tests.
- Atomic transaction behavior: unchanged transaction envelope in bid repository.
- Flood/rate-limit protections: unchanged behavior and tests remain green.

## Tests and Commands Executed
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run perf:bid-latency`

All commands passed.

## Files Changed
- `package.json`
- `scripts/run-bid-latency-perf.ts`
- `src/modules/bidding/application/place_bid_service.ts`
- `src/modules/bidding/application/place_bid_service.test.ts`
- `src/modules/bidding/infrastructure/bid_sql_repository.ts`
- `src/modules/bidding/transport/post_bid_handler.ts`
- `tests/integration/block8_bid_latency_perf.test.ts`
- `docs/progress/block-8-latency-hardening-report.md`

## Remaining Blockers for Public Launch
1. Bid p95 is improved but still above strict sub-second launch-grade expectations in synthetic high-concurrency storm conditions.
2. Current perf runs use local PGlite; staging/prod-like Postgres benchmarks are still required for external validity.
3. `docs/architecture/perf/hot_paths.yaml` does not yet explicitly track `/api/bids` with a budget gate, so CI budget enforcement is incomplete for this path.
