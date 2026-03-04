# Block 2 Report - Fast MVP Database Contract and Migrations

## Scope Completed
Implemented Block 2 only: Fast MVP database contract (Prisma + SQL migration), required constraints/indexes/triggers, and integration tests for contract invariants.

## Files Changed
- `prisma/schema.prisma`
- `prisma/migrations/20260301143000_block2_fast_mvp_database_contract/migration.sql`
- `tests/integration/helpers/migration_harness.ts`
- `tests/integration/block2_database_contract.test.ts`
- `scripts/run-clean-db-migrations.ts`
- `package.json`
- `package-lock.json`
- `docs/progress/block-2-report.md`

## Contract Implemented
Added Fast MVP contract tables:
- `auctions`
- `auction_state_transitions`
- `deposit_wallets`
- `deposit_locks`
- `bids`
- `bid_requests`
- `invoices`
- `payments`
- `payment_webhook_events`
- `payment_deadlines`
- `financial_events`

## Required Constraints and Indexes Implemented
1. Unique active lock per `(auction_id, company_id)` where `status='ACTIVE'`:
- `deposit_locks_active_lock_unique` (partial unique index)

2. Unique bid idempotency key `(auction_id, company_id, idempotency_key)`:
- `bid_requests_auction_company_idempotency_key`

3. Unique webhook dedupe key `stripe_event_id`:
- `payment_webhook_events_stripe_event_id_key`

4. Wallet non-negative checks:
- `deposit_wallets_available_balance_non_negative_check`
- `deposit_wallets_locked_balance_non_negative_check`
- `deposit_wallets_pending_withdrawal_balance_non_negative_check`

5. Invoice total consistency check:
- `invoices_total_consistency_check` (`total = subtotal + commission + vat`)

6. Append-only enforcement via trigger function + triggers:
- function `enforce_append_only`
- triggers on:
  - `auction_state_transitions`
  - `bids`
  - `payment_webhook_events`
  - `financial_events`

## Key Design Decisions
1. Kept schema strictly within Fast MVP scope (no ledger tables, no outbox worker tables, no settlement table/module).
2. Used explicit SQL migration for partial indexes, check constraints, and append-only triggers that Prisma schema cannot fully express.
3. Kept IDs as `TEXT` in SQL for compatibility with current project shape and low-friction inserts in tests.
4. Added a clean-DB migration harness using `@electric-sql/pglite` to execute all migrations in CI-friendly local runs without external Postgres dependency.

## Commands Executed
- `npx prisma format`
- `npm install -D @electric-sql/pglite`
- `npm run db:migrate:clean`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npx prisma validate`

## Validation Summary
- Clean DB migration apply: pass
- Lint: pass
- Typecheck: pass
- Integration tests (DB invariants + existing): pass
- Full test suite: pass
- Prisma schema validation: pass

## Current Gaps for Next Block
1. Runtime/business wiring is intentionally deferred:
- No bid/payment endpoint logic added in this block.

2. Status-transition business guards are not yet implemented:
- DB transition history exists, but transition matrix enforcement is next-layer application/domain logic.

3. Financial command execution flow is not yet implemented:
- Constraints and `financial_events` table are ready, but transaction orchestration belongs to next blocks.
