# Block 3 Report - Auction State Machine + Deposit Command Core

## Scope Completed
Implemented Block 3 only:
1. Auction state machine (domain + application) with explicit allowlist transitions and deterministic conflict errors.
2. Transition persistence in same transaction as auction state mutation.
3. Deposit command core (wallet credit, acquire lock, release lock, burn lock).
4. Deterministic deposit mutation lock order contract.
5. Unit + integration tests for transition matrix, transition persistence, wallet safety, and lock lifecycle.

## Files Changed
- `prisma/schema.prisma`
- `prisma/migrations/20260301170000_block3_add_ended_state/migration.sql`
- `src/lib/domain_errors.ts`
- `src/lib/sql_contract.ts`
- `src/infrastructure/database/prisma_sql_runner.ts`
- `src/modules/auction/domain/auction_state_machine.ts`
- `src/modules/auction/domain/auction_state_machine.test.ts`
- `src/modules/auction/application/auction_transition_service.ts`
- `src/modules/auction/infrastructure/auction_transition_sql_repository.ts`
- `src/modules/auction/transport/.gitkeep`
- `src/modules/deposits/domain/deposit_lock_lifecycle.ts`
- `src/modules/deposits/domain/deposit_lock_lifecycle.test.ts`
- `src/modules/deposits/application/deposit_command_service.ts`
- `src/modules/deposits/infrastructure/deposit_command_sql_repository.ts`
- `src/modules/deposits/transport/.gitkeep`
- `tests/integration/helpers/pglite_sql_runner.ts`
- `tests/integration/block3_auction_deposit_core.test.ts`
- `tests/integration/block2_database_contract.test.ts`
- `package.json`
- `docs/progress/block-3-report.md`

## Auction State Machine (Block 3 Contract)
Allowed transitions implemented exactly:
- `DRAFT -> SCHEDULED`
- `SCHEDULED -> LIVE`
- `LIVE -> ENDED`
- `ENDED -> PAYMENT_PENDING`
- `PAYMENT_PENDING -> PAID`
- `PAYMENT_PENDING -> DEFAULTED`

Invalid transitions throw deterministic `DomainConflictError` with:
- `code = AUCTION_INVALID_TRANSITION`
- `status = 409`

Legacy DB state `CLOSED` is normalized to `ENDED` in domain logic for compatibility.

## Transaction Boundaries

### Auction transition command
Single transaction includes:
1. `SELECT ... FOR UPDATE` auction row
2. Transition validation in domain layer
3. `UPDATE auctions` (`state`, `version`, timestamps)
4. `INSERT auction_state_transitions` (exactly one row)

If validation fails, transaction aborts with no mutation.

### Deposit commands
Each command is atomic in one transaction.

#### `adminWalletCredit`
1. Lock/create wallet row
2. Increment `available_balance`

#### `acquireDepositLock`
1. Lock wallet row
2. Lock existing active lock row for `(auction_id, company_id)`
3. Lock auction row
4. Validate existing lock and wallet funds
5. Update wallet balances (`available - amount`, `locked + amount`)
6. Insert `deposit_locks` row with `ACTIVE`

#### `releaseDepositLock`
1. Read lock reference
2. Lock wallet row
3. Lock deposit lock row
4. Lock auction row
5. Validate lifecycle (`ACTIVE -> RELEASED`)
6. Update wallet balances (`available + amount`, `locked - amount`)
7. Update lock to `RELEASED` and set `released_at`

#### `burnDepositLock`
1. Read lock reference
2. Lock wallet row
3. Lock deposit lock row
4. Lock auction row
5. Validate lifecycle (`ACTIVE -> BURNED`)
6. Update wallet balances (`locked - amount`)
7. Update lock to `BURNED` and set `burned_at`

## Deterministic Lock Order
Enforced for deposit mutations:
- `wallet row -> deposit_lock row -> auction row`

Exported contract:
- `depositMutationLockOrder = ["wallet row", "deposit_lock row", "auction row"]`

## Tests Executed and Results

### Unit
- `auction transition matrix allows only declared transitions` - pass
- `legacy CLOSED persistence state is normalized to ENDED` - pass
- `deposit lock lifecycle only allows ACTIVE -> RELEASED/BURNED` - pass

### Integration
- `auction transition persists exactly one transition row per valid transition` - pass
- `wallet remains non-negative under concurrent lock and release attempts` - pass
- `deposit lock lifecycle only permits ACTIVE to RELEASED or BURNED` - pass
- Existing Block 2 and structured logging integration tests also pass

### Validation commands
- `npm run lint` - pass
- `npm run typecheck` - pass
- `npm run test:unit` - pass
- `npm run test:integration` - pass
- `npm run db:migrate:clean` - pass
