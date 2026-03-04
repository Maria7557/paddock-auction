# Controlled MVP Auction Execution Plan

## 1. Executive Summary

### What MVP delivers
- Controlled B2B auction flow with hard financial gating and deterministic lifecycle.
- Deposit-gated bidding (`INV-01`, `INV-04`, `FIN-INV-01`).
- Deterministic auction state transitions and transition history (`INV-09`, `DATA-INV-03`).
- Idempotent bid, payment, and financial command handling (`INV-08`, `DATA-INV-02`, `S6`).
- Winner invoice generation and Stripe payment processing.
- 48-hour payment deadline enforcement and default handling (`INV-05`, `INV-06`).
- Simplified settlement with ledger-backed payout sequencing (`INV-10`, `FIN-INV-04`, `FIN-INV-05`).
- Minimal transactional outbox and atomic DB transactions (`DATA-INV-03`, `S3.1`, `S7.1`).

### What is intentionally excluded
- Dual-approval override runtime flows.
- Advanced reconciliation automation.
- Mutation testing.
- Complex withdrawal orchestration.
- Automated seller payout engine.
- Advanced compliance orchestration.

### Architectural trade-offs
- Modular monolith on Next.js + Prisma + Postgres for delivery speed and strict transactionality.
- Strong correctness over peak throughput on hot paths.
- At-least-once event delivery with idempotent consumers, not exactly-once messaging.
- Minimal outbox worker now; richer workflow engine deferred.

## 2. Final Module Structure

| Module | Primary Path | Responsibility | Why this structure works for autonomous AI execution |
|---|---|---|---|
| Platform Core | `src/modules/platform` | Transaction wrapper, idempotency store, audit append, outbox primitives, lock-order policy | Centralizes cross-cutting rules so every command reuses one implementation pattern |
| Identity & Eligibility | `src/modules/identity_access` | Approval, blacklist, compliance-hold, tenant role checks | Single source for all bid/payment/settlement gating decisions |
| Auction Lifecycle | `src/modules/auction` | Auction aggregate, deterministic transition matrix, versioning, winner finalization trigger | Keeps lifecycle legality isolated and testable |
| Bidding | `src/modules/bidding` | Idempotent bid endpoint, increment checks, anti-sniping, bid persistence | Contains high-contention path with explicit concurrency controls |
| Finance Core | `src/modules/finance` | Deposit wallets/locks and immutable ledger posting engine | Enforces all money mutations under one boundary |
| Billing & Payments | `src/modules/billing` | Invoice creation, payment state machine, Stripe webhook processing, payment deadlines, simplified settlement orchestration | Groups winner monetary flow end-to-end for MVP |
| Workflows & Outbox Worker | `src/modules/workflows` | Scheduled deadline/default enforcement, auction time transitions, outbox publish/retry loop | Keeps async post-commit behavior deterministic and minimal |

## 3. Detailed Module Specifications

## Module 1: Platform Core

### A) Purpose
Provide mandatory command execution primitives used by all mutation handlers: transaction envelope, idempotency protocol, immutable audit write, outbox enqueue, bounded retry.

### B) Data Model
- `idempotency_keys`
  - Fields: `id`, `tenant_id`, `actor_id`, `endpoint`, `idempotency_key`, `request_hash`, `status`, `response_status`, `response_body`, `created_at`, `expires_at`.
  - Constraints: unique `(tenant_id, actor_id, endpoint, idempotency_key)`; `expires_at > created_at`.
- `outbox_events`
  - Fields: `id`, `aggregate_type`, `aggregate_id`, `event_type`, `partition_key`, `payload`, `status`, `attempts`, `next_attempt_at`, `created_at`, `published_at`.
  - Constraints: index `(status, next_attempt_at, id)`; `attempts >= 0`.
- `audit_logs` (append-only)
  - Fields: `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `correlation_id`, `idempotency_key`, `payload_hash`, `payload`, `created_at`.
  - Constraints: DB trigger rejects update/delete (`DATA-INV-01`).
- `consumer_checkpoints`
  - Fields: `id`, `consumer_name`, `event_id`, `processed_at`.
  - Constraints: unique `(consumer_name, event_id)`.

### C) Domain Invariants enforced
- `DATA-INV-01`, `DATA-INV-02`, `DATA-INV-03`, `DATA-INV-04`, `S3.1`, `S6.1`, `S7.1`, `S11.2`.

### D) Command Handlers
- `executeCommandWithTransaction(commandContext, handlerFn)`.
- `startIdempotentExecution(...)`.
- `completeIdempotentExecution(...)`.
- `appendAuditRecord(...)`.
- `enqueueOutboxEvent(...)`.
- `retryOnSerializationOrDeadlock(max=3)`.

### E) Transaction Boundaries
- Idempotency row creation/check happens at command start in same transaction as business mutation.
- Required coupled writes: business mutation + audit + outbox + (ledger where applicable) in one commit (`DATA-INV-03`).
- No external network calls while transaction is open (`S3.1.3`).

### F) Required Tests
- Unit: idempotency hash match/mismatch behavior.
- Unit: bounded retry policy for deadlock codes.
- Integration: rollback when outbox insert fails.
- Integration: rollback when audit insert fails.
- Integration: append-only trigger enforcement.

### G) Idempotency Strategy
- Mandatory header `Idempotency-Key` for all mutation routes.
- Same key + same hash returns byte-equivalent cached response.
- Same key + different hash returns deterministic `409`.
- TTLs: financial 365d, bidding 90d, non-financial 30d (`S6.2`).

### H) Failure Modes and handling
- Unique violation on idempotency key with different hash: return `409`.
- Serialization/deadlock: retry up to 3, then return retryable `409` with correlation ID.
- Audit/outbox failure: full rollback, no partial mutation.

### I) Future Hardening Hooks
- Signature/encryption on audit payload hash chain.
- Dedicated idempotency storage tier.
- Outbox lease-based publisher partitioning.

## Module 2: Identity & Eligibility

### A) Purpose
Own all hard-gate eligibility checks consumed synchronously by bid, payment, and settlement commands.

### B) Data Model
- `companies`: `id`, `status`, `compliance_hold`, `created_at`, `updated_at`.
  - Constraints: status enum; indexed by `(status, compliance_hold)`.
- `users`: `id`, `email`, `status`, `created_at`, `updated_at`.
  - Constraints: unique `email`.
- `user_company_roles`: `user_id`, `company_id`, `role`.
  - Constraints: unique `(user_id, company_id, role)`.
- `approval_records` (append-only): `entity_type`, `entity_id`, `decision`, `actor_id`, `created_at`.
- `blacklist_entries` (append-only): `entity_type`, `entity_id`, `effective_from`, `effective_to`, `reason`, `actor_id`.
  - Constraints: active lookup index on `(entity_type, entity_id, effective_from, effective_to)`.

### C) Domain Invariants enforced
- `INV-02`, `INV-03`, `FIN-INV-03`, `S8.2`, `S9.1`.

### D) Command Handlers
- `approveEntity(entityType, entityId, decision, actorId)`.
- `setComplianceHold(entityType, entityId, hold, reason)`.
- `addBlacklistEntry(...)`.
- `removeBlacklistEntry(...)`.
- `evaluateBidEligibility(userId, companyId)`.
- `evaluateWithdrawalEligibility(companyId)`.
- `evaluateSettlementEligibility(companyId)`.

### E) Transaction Boundaries
- Admin mutation commands: decision row + entity status update + audit + outbox in one transaction.
- Eligibility evaluation is read-only against primary DB.

### F) Required Tests
- Unit: eligibility policy matrix across approved/hold/blacklist combinations.
- Integration: cross-tenant denial cases.
- Integration: admin cannot bypass hard gates when placing bids (`S8.2.4`).
- Integration: compliance hold blocks bid/withdrawal/settlement paths.

### G) Idempotency strategy
- Admin mutation endpoints use standard idempotency middleware from Module 1.
- Read-only evaluation commands do not require idempotency keys.

### H) Failure Modes and handling
- Concurrent approval updates: optimistic conflict returns `409`.
- Blacklist overlap ambiguity: deterministic “blocked” result with audit evidence.
- Missing company-role mapping: `403` deny.

### I) Future Hardening Hooks
- Multi-step approval workflow fields.
- Evidence attachment references on blacklist and approval records.
- Policy version snapshoting for forensic replay.

## Module 3: Auction Lifecycle

### A) Purpose
Implement deterministic auction aggregate lifecycle and state-transition legality.

### B) Data Model
- `auctions`
  - Fields: `id`, `vehicle_id`, `seller_company_id`, `state`, `version`, `starts_at`, `ends_at`, `extension_count`, `highest_bid_id`, `winner_company_id`, `closed_at`, `created_at`, `updated_at`.
  - Constraints: `starts_at < ends_at`; `version >= 0`; state enum includes all PRD states.
- `auction_state_transitions` (append-only)
  - Fields: `id`, `auction_id`, `from_state`, `to_state`, `trigger`, `reason`, `actor_id`, `created_at`.
  - Constraints: index `(auction_id, created_at)`.
- `vehicles` minimal fields required for auction creation/winner linking.

### C) Domain Invariants enforced
- `INV-09`, `DATA-INV-03`, `DATA-INV-05`, `S5.1`.

### D) Command Handlers
- `createAuctionDraft`.
- `publishAuction`.
- `startAuctionIfDue`.
- `applyBidResult(auctionId, bidId, amount, placedAt)` for highest bid + anti-sniping.
- `closeAuctionAndSelectWinner`.
- `transitionToPaymentPending`.
- `transitionToSettled`.
- `transitionToDefaulted`.
- `cancelAuction`.
- `relistAuction`.

### E) Transaction Boundaries
- Every transition command writes: aggregate update + transition row + outbox + audit atomically.
- `closeAuctionAndSelectWinner` runs with auction row lock + version check; emits winner data for invoice creation.

### F) Required Tests
- Unit: full transition matrix (allow/deny).
- Unit: anti-sniping extension deterministic math.
- Integration: concurrent close command, exactly one success.
- Integration: invalid transition returns `409` and no row mutation.

### G) Idempotency strategy
- Transition endpoints and scheduler-triggered commands use idempotency key per aggregate+action+time bucket.

### H) Failure Modes and handling
- Version conflict on concurrent updates: deterministic retryable conflict.
- Missing winner on close: transition to relist path, not payment path.
- Transition logging failure: full rollback.

### I) Future Hardening Hooks
- Dual approval enforcement for critical transitions.
- Rich inspection lifecycle gating.
- Transition reason taxonomy and policy-engine validation.

## Module 4: Bidding

### A) Purpose
Provide one authoritative `POST /api/bids` command path with replay-safe idempotency and deterministic concurrent bidding.

### B) Data Model
- `bids` (append-only)
  - Fields: `id`, `auction_id`, `company_id`, `user_id`, `amount`, `sequence_no`, `created_at`.
  - Constraints: unique `(auction_id, sequence_no)`; `amount > 0`.
- `bid_requests`
  - Fields: `id`, `auction_id`, `company_id`, `idempotency_key`, `request_hash`, `status`, `response_status`, `response_body`, `bid_id`, `created_at`, `expires_at`.
  - Constraints: unique `(auction_id, company_id, idempotency_key)`.

### C) Domain Invariants enforced
- `INV-01`, `INV-04`, `INV-08`, `INV-09`, `FIN-INV-01`, `DATA-INV-02`, `DATA-INV-03`, `DATA-INV-04`.

### D) Command Handlers
- `placeBid(auctionId, companyId, userId, amount, idempotencyKey)`.
- Internal helper: `resolveBidRequestReplayState`.

### E) Transaction Boundaries
- Flow in order:
  1. Idempotency precheck (`bid_requests`).
  2. Load auction current state/version.
  3. Validate eligibility through Module 2.
  4. Acquire/validate deposit lock through Module 5.
  5. Insert bid and sequence number.
  6. Update auction highest bid + optional extension + version increment.
  7. Persist replay payload in `bid_requests`.
  8. Audit + outbox.
- Entire flow is one transaction after advisory lock acquisition; Redis lock failure falls back to DB-only correctness path.

### F) Required Tests
- Unit: bid increment rule and tie-break logic.
- Unit: anti-sniping window calculations.
- Integration: same idempotency key same hash replays exact response.
- Integration: same key different hash returns `409`.
- Integration: concurrent 50-bid storm yields strict sequence with no duplicates.
- Integration: insufficient deposit rejects with no wallet/bid mutation.

### G) Idempotency strategy
- Primary idempotency key scope: `(auction_id, company_id, idempotency_key)` (`S6.2.2`).
- Cached response body stored in `bid_requests`.
- TTL: 90 days minimum.

### H) Failure Modes and handling
- Advisory lock unavailable: continue with DB constraint path; include degraded-mode metric.
- Version conflict: retry once in-handler, then return deterministic conflict.
- Duplicate retries after timeout: safe replay from `bid_requests`.

### I) Future Hardening Hooks
- Dynamic risk-based bid throttling.
- Device fingerprint and geo mismatch pre-bid hooks.
- Auction sharding strategy for very high concurrency auctions.

## Module 5: Finance Core (Wallet + Ledger)

### A) Purpose
Own all deposit collateral and ledger posting commands used by bidding, default, payment, and settlement flows.

### B) Data Model
- `deposit_wallets`
  - Fields: `id`, `company_id`, `currency`, `available_balance`, `locked_balance`, `pending_withdrawal_balance`, `created_at`, `updated_at`.
  - Constraints: unique `(company_id, currency)`; all balances `>= 0`.
- `deposit_locks`
  - Fields: `id`, `auction_id`, `company_id`, `amount`, `status`, `created_at`, `released_at`, `burned_at`, `resolution_reason`.
  - Constraints: partial unique active lock `(auction_id, company_id) where status='ACTIVE'`; `amount > 0`.
- `ledger_accounts`
  - Fields: `id`, `code`, `type`, `currency`.
  - Constraints: unique `code`.
- `ledger_entries` (append-only)
  - Fields: `id`, `source_type`, `source_id`, `posted_at`, `created_at`.
  - Constraints: unique `(source_type, source_id)`.
- `ledger_lines` (append-only)
  - Fields: `id`, `entry_id`, `account_id`, `debit`, `credit`.
  - Constraints: one-sided amount check; positive amount check; balanced-entry DB constraint/trigger.

### C) Domain Invariants enforced
- `INV-10`, `FIN-INV-02`, `FIN-INV-06`, `DATA-INV-03`, `DATA-INV-04`, `S4.2`, `S4.3`.

### D) Command Handlers
- `creditDepositFromCapturedTopup`.
- `acquireDepositLockForBid`.
- `releaseDepositLockAfterAuction`.
- `burnDepositLockOnDefault`.
- `postLedgerEntry(sourceType, sourceId, lines)` internal.
- `validateLedgerBalanced(entryId)` internal.

### E) Transaction Boundaries
- Every financial command transaction includes wallet/lock mutation + ledger entry + audit + outbox.
- Deterministic row lock order for all finance commands: wallet row -> lock row -> invoice/payment row (if present) -> settlement row.

### F) Required Tests
- Unit: lock lifecycle transition rules.
- Unit: posting matrix mapping for each command type.
- Integration: non-negative wallet constraints under concurrent commands.
- Integration: duplicate `source_type/source_id` blocked.
- Property-based: random valid postings always balanced.
- Integration: append-only enforcement on ledger tables.

### G) Idempotency strategy
- External command idempotency key via Module 1.
- Financial posting idempotency via unique `(source_type, source_id)` at ledger layer.
- TTL for financial idempotency records: 365 days minimum.

### H) Failure Modes and handling
- Insufficient available balance: deterministic rejection before bid acceptance.
- Duplicate lock acquisition: existing lock reused when compatible; otherwise reject.
- Ledger posting failure: rollback entire command.

### I) Future Hardening Hooks
- Multi-currency wallet/account expansion.
- Withdrawal reserve/complete/reject command set.
- Real-time reconciliation status fields per ledger source.

## Module 6: Billing, Stripe Payments, and Simplified Settlement

### A) Purpose
Implement winner invoice generation, payment collection, deadline-driven default, and manual-trigger simplified settlement.

### B) Data Model
- `invoices`
  - Fields: `id`, `auction_id`, `buyer_company_id`, `seller_company_id`, `subtotal`, `commission`, `vat`, `total`, `currency`, `status`, `issued_at`, `due_at`, `paid_at`.
  - Constraints: one active invoice per `auction_id`; monetary fields non-negative.
- `payments`
  - Fields: `id`, `invoice_id`, `status`, `idempotency_key`, `stripe_payment_intent_id`, `stripe_charge_id`, `amount`, `currency`, `failure_reason_code`, `last_event_at`, `created_at`.
  - Constraints: unique `stripe_payment_intent_id` when present.
- `payment_webhook_events`
  - Fields: `id`, `stripe_event_id`, `event_type`, `payload_hash`, `processed_at`, `status`.
  - Constraints: unique `stripe_event_id`.
- `payment_deadlines`
  - Fields: `id`, `auction_id`, `buyer_company_id`, `due_at`, `status`, `escalated_flag`, `resolved_at`.
  - Constraints: one active deadline per `(auction_id, buyer_company_id)`.
- `settlements`
  - Fields: `id`, `auction_id`, `seller_company_id`, `invoice_id`, `status`, `payout_ref`, `executed_at`, `created_at`.
  - Constraints: unique `auction_id`.

### C) Domain Invariants enforced
- `INV-05`, `INV-06`, `INV-08`, `INV-10`, `FIN-INV-04`, `FIN-INV-05`, `FIN-INV-06`, `FIN-INV-07`, `DATA-INV-03`.

### D) Command Handlers
- `createInvoiceForAuctionWinner`.
- `createPaymentIntentForInvoice`.
- `handleStripeWebhook(stripeEvent)`.
- `markPaymentSucceeded`.
- `markPaymentFailed`.
- `enforcePaymentDeadlineDefault`.
- `executeSimplifiedSettlement`.

### E) Transaction Boundaries
- Invoice creation transaction: invoice row + deadline row + auction transition to `PaymentPending` + audit + outbox.
- Payment success transaction: payment state transition + invoice paid status + ledger posting (cash clearing vs receivable) + outbox.
- Default transaction at deadline: deadline missed + invoice defaulted + auction defaulted + deposit burn command (Module 5) + outbox.
- Settlement transaction: verify payment/invoice/ledger preconditions + settlement row + payout ledger posting + auction settled transition + outbox.
- Stripe API calls and webhook acknowledgement done outside open DB transactions except short dedupe insert + state transition transaction.

### F) Required Tests
- Unit: payment state transition legality.
- Unit: invoice total calculation determinism.
- Integration: duplicate webhook event processes once.
- Integration: out-of-order webhook does not corrupt payment state.
- Integration: deadline job after `due_at` defaults exactly once and burns lock once.
- Integration: settlement blocked until receivable closure is proven.

### G) Idempotency strategy
- Payment intent creation requires `Idempotency-Key`.
- Webhook dedupe by unique `stripe_event_id`.
- Settlement execution endpoint requires `Idempotency-Key`.
- Ledger source uniqueness prevents duplicate financial postings.

### H) Failure Modes and handling
- Stripe timeout during payment intent creation: return retry-safe failure with preserved idempotency state.
- Late success webhook after default: route to exception state, no silent reversal.
- Settlement precondition failure: deterministic block with explicit code and audit record.

### I) Future Hardening Hooks
- `LEGAL_ORDER_SETTLEMENT` dual-approval override flow.
- Automated payout scheduling and retries.
- Automated reconciliation with external bank/Stripe settlement reports.

## Module 7: Workflows and Minimal Outbox Worker

### A) Purpose
Execute time-based and post-commit workflows deterministically: auction start/close, deadline enforcement, outbox publish/retry.

### B) Data Model
- `workflow_job_runs`
  - Fields: `id`, `job_name`, `run_slot_utc`, `status`, `started_at`, `finished_at`, `error_summary`.
  - Constraints: unique `(job_name, run_slot_utc)`.
- Reuses `outbox_events` from Module 1.

### C) Domain Invariants enforced
- `INV-05`, `INV-09`, `DATA-INV-03`, `DATA-INV-04`, `S7.1`, `S7.2`.

### D) Command Handlers
- `runAuctionTimeTransitionJob` (Scheduled->Live and Live/Extended->Closed).
- `runPaymentDeadlineEnforcementJob`.
- `runOutboxPublishJob`.
- `runOutboxRetryJob`.

### E) Transaction Boundaries
- Each job claims run slot idempotently via `workflow_job_runs`.
- Aggregate processing uses `FOR UPDATE SKIP LOCKED` in bounded batches.
- Outbox status transitions `PENDING -> PUBLISHED/FAILED` are atomic per event row.

### F) Required Tests
- Integration: duplicate scheduler invocation same slot executes once.
- Integration: worker crash mid-batch resumes safely.
- Integration: outbox retry respects exponential backoff.
- Integration: auction close job and payment deadline job are idempotent across reruns.

### G) Idempotency strategy
- Job-level idempotency with unique run slot.
- Event-level idempotency with outbox row state and consumer checkpoints.

### H) Failure Modes and handling
- Partial batch failure: unprocessed events remain pending for next run.
- Event publish failure: increment attempts, set `next_attempt_at`, move to `FAILED` after threshold.
- Stuck backlog: emit lag alert; processing remains safe.

### I) Future Hardening Hooks
- Move scheduling to dedicated workflow engine.
- Multi-worker partitioned outbox publishers.
- DLQ replay UI and operator tooling.

## 4. Sequential Build Plan (AI Execution Order)

1. Commit 1: Foundation test harness + module scaffolding.
   - Add `src/modules/*/{domain,application,infrastructure,transport}` structure.
   - Add test stack (`vitest` + integration harness) and scripts.
   - Must pass: lint, typecheck, empty unit test suite.

2. Commit 2: Platform Core primitives.
   - Implement transaction wrapper, idempotency middleware, audit writer, outbox writer contracts.
   - Must pass: unit tests for idempotency behavior; integration rollback tests.

3. Commit 3: Prisma schema expansion for MVP tables + constraints + append-only triggers.
   - Include all tables listed across modules, unique keys, check constraints, partial indexes.
   - Must pass: migration apply on clean DB, integration tests for append-only and constraints.

4. Commit 4: Identity & Eligibility module.
   - Implement approval/blacklist/compliance-hold commands and synchronous eligibility policy API.
   - Must pass: cross-tenant denial tests, hold/blacklist gate tests.

5. Commit 5: Auction lifecycle state machine.
   - Implement transition matrix, transition persistence, versioning, publish/start/close flows.
   - Must pass: transition matrix tests and concurrent close conflict tests.

6. Commit 6: Finance Core wallet/lock/ledger commands.
   - Implement deposit wallet movement and ledger posting engine.
   - Must pass: non-negative wallet concurrency tests, balanced-ledger property tests.

7. Commit 7: Bidding endpoint (`POST /api/bids`).
   - Implement idempotent bid path with advisory lock + DB authoritative checks.
   - Must pass: replay tests, mismatch `409`, high-concurrency duplicate-prevention tests.

8. Commit 8: Invoice + payment intent + Stripe webhook processing.
   - Implement invoice creation at winner finalization, payment state machine, webhook dedupe.
   - Must pass: duplicate webhook test, payment transition guard tests.

9. Commit 9: Payment deadline enforcement + default + deposit burn + simplified settlement.
   - Implement scheduled deadline command and manual settlement command.
   - Must pass: deadline expiry default test, one-time burn test, settlement precondition tests.

10. Commit 10: Workflow jobs + minimal outbox publisher.
    - Implement job run dedupe and outbox publish/retry loop.
    - Must pass: crash-recovery test, outbox replay-idempotency test.

11. Commit 11: End-to-end critical path suite.
    - Scenario: deposit funded -> bid -> auction close -> invoice -> payment success -> settlement.
    - Scenario: deposit funded -> bid -> auction close -> deadline miss -> default + burn.
    - Must pass: all E2E scenarios and hot-path latency sanity checks in non-prod load profile.

12. Commit 12: Governance file updates (existing files only) + release gate.
    - Update existing `table_ownership.yaml`, `critical_financial_modules.yaml`, `hot_paths.yaml`, `architecture_significant_paths.yaml` entries to match implemented artifacts.
    - Must pass: lint/typecheck/unit/integration/E2E/coverage gates.

### Explicit dependency chain
- 2 depends on 1.
- 3 depends on 2.
- 4 depends on 3.
- 5 depends on 4.
- 6 depends on 3 and 4.
- 7 depends on 5 and 6.
- 8 depends on 5 and 7.
- 9 depends on 6 and 8.
- 10 depends on 2 and 8/9 producers.
- 11 depends on 4-10.
- 12 depends on all prior steps.

## 5. MVP Completion Definition

“Auction is production-ready MVP” when all criteria below are true:

1. Bid endpoint enforces deposit gate and eligibility gate before bid acceptance (`INV-01`, `INV-02`, `INV-03`, `INV-04`).
2. Bid endpoint is idempotent with deterministic replay and conflict behavior (`INV-08`, `DATA-INV-02`).
3. Auction transitions are matrix-enforced; invalid transitions never mutate state (`INV-09`).
4. Every financial mutation generates exactly one balanced ledger source posting (`INV-10`, `FIN-INV-06`).
5. Winner invoice is generated at close and due date is `closed_at + 48h` (`INV-05`).
6. Stripe webhook duplicate deliveries are safely deduped.
7. Payment success transitions invoice to paid and enables settlement.
8. Payment deadline miss triggers default and deposit burn once (`INV-06`).
9. Simplified settlement executes only after payment and ledger preconditions (`FIN-INV-04`, `FIN-INV-05`).
10. Outbox events are written in same transaction as source mutations and are publish-recoverable.
11. Core E2E scenarios (success and default paths) pass in CI.
12. No command in financial/bid paths performs partial success on failure (`DATA-INV-03`).

## 6. Deferred Controls Registry

| Deferred control | MVP behavior now | Future integration path (no schema breakage) |
|---|---|---|
| Dual approval overrides | Critical override flows not exposed in MVP command surface | Add override approval state machine on existing `admin_overrides` with second approver fields and policy checks |
| Advanced reconciliation automation | Reconciliation is manual report/query driven | Add `reconciliation_runs` + `reconciliation_exceptions` and async matcher worker using existing ledger/payment references |
| Mutation testing | Standard unit/integration/E2E only | Add mutation test stage in CI without changing runtime schema |
| Complex withdrawal flows | Withdrawal orchestration not part of MVP critical path | Extend `deposit_withdrawal_requests` and event tables with richer statuses/retry metadata |
| Automated seller payout engine | Settlement command is manual/idempotent | Add payout scheduler and retry worker using existing `settlements` and ledger source IDs |
| Advanced compliance orchestration | Synchronous hold gate only | Add case management and orchestration workers linked to existing `compliance_hold` and audit events |

## 7. Risk Assessment of MVP Strategy

### Technical risks
- Hot auction contention on `auctions.version` and wallet locks can raise bid conflict rates.
- Single minimal outbox worker can backlog under burst writes.
- Stripe webhook ordering edge cases can create exception volume near deadline boundaries.

### Financial risks
- Posting matrix misconfiguration can block settlement or cause reconciliation exceptions.
- Late payment callback after default requires controlled exception handling to avoid unauthorized reversals.
- Manual settlement operation increases operator-error surface until payout automation is added.

### Scale risks
- First bottleneck is write contention on live auction rows at high bid rates.
- Second bottleneck is outbox lag causing delayed notifications and websocket updates.
- Third bottleneck is synchronous policy checks if eligibility reads are not indexed/cached correctly.

### What breaks first at 10k users
1. High-traffic auctions: bid p95 rises above target due to version conflicts and row lock contention.
2. Outbox lag: event publish delay impacts real-time UX and deadline alert timeliness.
3. Worker throughput: payment/webhook/deadline jobs compete for DB IOPS without partitioned workers.

Immediate mitigation path for 10k:
- Add auction-key partitioned worker concurrency, stricter hot-path indexes, and multi-publisher outbox leasing before adding new product scope.
