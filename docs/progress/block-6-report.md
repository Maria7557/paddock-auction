# Block 6 Report - Payment Deadline Enforcement + Deposit Burn on Default

## Scope Completed
Implemented Block 6 only:
1. Added internal/scheduled deadline enforcement path (`POST /api/internal/payment-deadlines/enforce`) and billing service/repository.
2. Enforcement scans due deadlines with `FOR UPDATE SKIP LOCKED` (status `ACTIVE`, treated as OPEN in current schema).
3. For each due deadline:
   - Locks invoice + auction + winner active deposit lock + winner wallet.
   - If invoice is `PAID`, marks deadline `PAID` and skips default/burn.
   - If invoice unpaid, marks deadline `DEFAULTED`, invoice `DEFAULTED`, transitions auction `PAYMENT_PENDING -> DEFAULTED` with transition row, burns winner lock, and writes `DEPOSIT_BURN` financial event.
4. Idempotency safety implemented by processing only active due deadlines and stateful updates inside one transaction per row; reruns are safe no-op for already processed deadlines.
5. Metrics/logging:
   - increments `payment_deadline_default_total` on real default only.
   - emits structured per-deadline logs with `correlation_id`, `auction_id`, `company_id`, `result`, `duration_ms`.
6. Added integration tests for one-time default/burn, rerun idempotency, paid skip path, and wallet non-negative burn path.

## Files Changed
- `app/api/internal/payment-deadlines/enforce/route.ts`
- `src/modules/billing/infrastructure/payment_deadline_enforcement_sql_repository.ts`
- `src/modules/billing/application/payment_deadline_enforcement_service.ts`
- `src/modules/billing/transport/post_payment_deadline_enforcement_handler.ts`
- `tests/integration/block6_payment_deadline_enforcement.test.ts`
- `docs/progress/block-6-report.md`

## Transaction Boundaries

### Per-deadline transaction
Each processed deadline runs in one DB transaction:
1. Select one due active deadline with `FOR UPDATE SKIP LOCKED`.
2. Lock related invoice row.
3. Branch:
   - `PAID` invoice: mark deadline `PAID`.
   - unpaid invoice: continue.
4. Lock auction row; transition `PAYMENT_PENDING -> DEFAULTED` (when applicable) + append transition history row.
5. Lock winner active deposit lock row.
6. Lock winner wallet row and burn lock amount from `locked_balance` only.
7. Mark deposit lock `BURNED`.
8. Insert `financial_events` `DEPOSIT_BURN` with `ON CONFLICT (source_type, source_id) DO NOTHING`.
9. Mark invoice `DEFAULTED` and deadline `DEFAULTED`.

## Idempotency / Replay Safety
- Enforcement selects only `payment_deadlines.status='ACTIVE'` and `due_at <= now`, so processed rows are not selected again.
- Reruns after first successful default return no due rows and do not double-burn.
- `financial_events` uniqueness (`source_type`, `source_id`) ensures one `DEPOSIT_BURN` event per lock source.

## Tests Executed and Results
- `npm run lint` - pass
- `npm run typecheck` - pass
- `npm run test:unit` - pass
- `npm run test:integration` - pass
- `npm run test:e2e` - pass

### Block 6 integration tests added (all pass)
- `default-and-burn happens once`
- `rerun is idempotent and does not double-burn`
- `already paid invoice is skipped safely`
- `wallet balance never goes negative on burn path`
