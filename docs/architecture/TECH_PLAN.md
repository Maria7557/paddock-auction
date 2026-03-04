# TECH_PLAN — UAE B2B Vehicle Auction Platform (Financially Enforced)

## 1. Technology Stack Description

### 1.1 Selected Stack

| Layer | Selected Technology | Why Selected | Alternatives Considered | Rejected Because | Scaling Characteristics | Financial Integrity Implications |
|---|---|---|---|---|---|---|
| Web/App Runtime | Next.js App Router (TypeScript) | Unified SSR + API surface, strong TypeScript ecosystem, fast iteration on monolith boundary | NestJS + React SPA, Go + gRPC + SSR BFF | Higher integration cost at current team maturity; slower initial delivery | Horizontal stateless scaling behind LB; route-level caching controls | SSR/API co-location reduces cross-service consistency bugs in early phases |
| Language | TypeScript | Type-level contracts across API/domain/infrastructure | Go, Kotlin | Team/tooling baseline already TypeScript | Good dev velocity; runtime overhead acceptable for current profile | Strong typing reduces financial schema/DTO mismatch risk |
| Primary DB | PostgreSQL | Strong transactions, row locking, mature indexing/partitioning, reliable durability | MySQL, CockroachDB, MongoDB | MySQL weaker ecosystem fit for planned append-only/audit patterns; Cockroach operational complexity; Mongo unsuitable for strict financial relational guarantees | Vertical + read-replica + partitioning path; can support 100k+ users with correct schema/index strategy | ACID boundaries are required for atomic lock/bid/ledger/outbox writes |
| ORM | Prisma | Migration tooling, typed data access, fast iteration | Drizzle, raw SQL-only | Raw SQL-only slows initial delivery; Drizzle migration/maturity tradeoffs for this team | Acceptable at this stage; use targeted raw SQL for hot paths | Must be wrapped by transaction boundary rules; cannot allow ad-hoc writes from handlers |
| Cache + Dist Lock | Redis Cluster (planned) | Low-latency lock and cache primitives | Postgres advisory locks only, ZooKeeper | Postgres-only locking can bottleneck under bid bursts; ZooKeeper overkill | Scales horizontally; lock granularity by aggregate keys | Secondary lock layer reduces race risk in bid path; DB remains source of truth |
| Payments | Stripe (PaymentIntents + Webhooks) | Strong UAE-compatible rails, mature webhook lifecycle, refund APIs | Adyen, Checkout.com, custom bank integration | Integration complexity/time; weaker immediate ecosystem fit | Scales externally; internal backpressure required on webhook consumers | Must enforce signature verification, replay dedupe, idempotent posting |
| Event Transport | Managed Event Bus (Kafka/Rabbit/SNS+SQS equivalent) | Async decoupling, retries, partitioning by key | DB polling only, synchronous fanout | Tight coupling, high latency, operational fragility | Partitioned consumers and horizontal scaling | Use outbox + idempotent consumers for financial correctness |
| Real-time | WebSocket Gateway + Pub/Sub backplane | Required for auction bid updates | Polling only, SSE only | Polling load spikes near auction end; SSE one-way limits | Horizontally scalable gateways with shared pub/sub | Real-time channel is non-authoritative; commit log stays in DB |
| Blob Storage | S3-compatible Object Storage | Durable inspection media and evidence storage | Local filesystem, DB blobs only | Operational risk and high DB bloat | Highly scalable object store with lifecycle policies | Evidence immutability anchors compliance and disputes |
| Search | OpenSearch/Elasticsearch (phase-gated) | Read-model search for listings and filtering | Postgres full-text only | Limited relevance and scaling flexibility | Horizontal cluster scaling; async indexing | Search is read-only derivative; no financial authority |
| Edge + Protection | API Gateway + WAF + Rate Limiting | Consistent authn/authz guardrails and abuse control | App-only middleware | Harder to enforce uniform limits and observability | Horizontally scalable edge controls | Prevents brute-force/idempotency abuse on financial endpoints |

### 1.2 Core Tradeoffs

1. Modular monolith first, service extraction later by hot-path pressure.
2. ACID correctness prioritized over maximal write throughput in financial paths.
3. At-least-once events with idempotent consumers chosen over fragile exactly-once messaging claims.
4. Redis lock is advisory; Postgres constraints remain authoritative.
5. Prisma for productivity, with targeted SQL for critical lock/version operations.

### 1.3 Financial Integrity Principles Applied to Stack

1. Postgres transaction is the unit of truth for all money and bid mutations.
2. Ledger, state transition, and outbox write occur in same transaction for critical paths.
3. Stripe events are accepted only after signature verification and dedupe checks.
4. Every external callback is treated as untrusted input until idempotency and state-machine validation passes.
5. Business invariant definitions are canonical in `PRD_v2.0.md` (`INV-*`, `FIN-INV-*`, `DATA-INV-*`); this document defines implementation mapping only.

---

## 2. Architecture Description

### 2.1 High-Level System Architecture

#### Runtime Components

1. Web App + API (Next.js App Router)
2. AuthN/AuthZ + Policy Engine
3. Auction Engine
4. Bidding Engine
5. Deposit & Wallet Service
6. Payment Orchestrator (Stripe integration)
7. Immutable Ledger Service
8. Settlement Service
9. Region Rules Engine
10. Risk & Compliance Engine
11. Notification Orchestrator
12. Reporting & Governance Service
13. WebSocket Gateway
14. Scheduler/Workflow Worker
15. PostgreSQL Primary + Replicas
16. Redis Cluster
17. Event Bus + DLQ
18. Object Storage
19. Search Index (derived read model)

#### Interaction Diagram (Text-Based)

```text
[Client UI SSR + API calls]
        |
        v
[API Gateway/WAF] -> [AuthN/AuthZ + Policy]
        |
        +--> [Auction/Bidding Service] --tx--> [PostgreSQL]
        |            |                        (bids, locks, state, outbox)
        |            +--> [Redis Lock]
        |
        +--> [Payment Orchestrator] --api--> [Stripe]
        |            |                         |
        |            +<-----webhook-----------+
        |            --tx--> [PostgreSQL] (payments, ledger, outbox)
        |
        +--> [Withdrawal/Settlement] --tx--> [PostgreSQL ledger]
        |
        +--> [WebSocket Gateway] <--- [Event Consumers]

[Outbox Publisher] -> [Event Bus] -> [Consumers]
     |                                  |
     v                                  v
[Notification Service]             [Risk/Compliance, Search, Reporting]
```

#### Bounded Contexts

| Context | Responsibilities | Owns Data |
|---|---|---|
| Identity & Access | Users, companies, roles, approvals, blacklist | `users`, `companies`, `user_company_roles`, `approval_records`, `blacklist_entries` |
| Auction | Vehicle lifecycle, inspections, auction state machine | `vehicles`, `inspection_*`, `auctions`, `auction_state_transitions` |
| Bidding | Bid acceptance, idempotent bid requests, anti-sniping | `bids`, `bid_requests` |
| Finance Core | Wallets, locks, invoices, payments, ledger | `deposit_*`, `invoices`, `payments`, `ledger_*`, `settlements` |
| Compliance & Risk | Risk scoring, compliance hold, geo-ip decisions, AML hooks | `risk_scores`, `risk_events`, `disputes`, `device_fingerprints` |
| Notifications | Multi-channel delivery, SLA and evidence | `notifications`, `notification_attempts` |
| Governance | Audit logs, overrides, exports | `audit_logs`, `admin_overrides`, `regulatory_exports` |
| Support | Chat threads and moderation | `chat_*` |

#### Data Ownership Rules

1. Only owning context can mutate its tables.
2. Cross-context interaction uses service APIs or events, never direct table writes.
3. Financial tables are mutated only by Finance Core transactional services.
4. Read-side projections may denormalize but are never authoritative for financial decisions.

### 2.2 Core Execution Paths

#### Atomic Bid Flow

1. Client sends bid with `Idempotency-Key` and JWT.
2. Policy layer validates approval, blacklist, company scope, auction state.
3. Service acquires Redis lock on `auction_id`.
4. Start DB transaction.
5. Upsert/fetch `bid_requests` by `(auction_id, company_id, idempotency_key)`.
6. If request already succeeded with same payload hash, return stored response.
7. Validate current auction version and bid increment rules.
8. Acquire or validate active deposit lock atomically.
9. Insert append-only bid record.
10. Optimistically update auction version and end time extension if anti-sniping applies.
11. Insert outbox event `BidPlaced`.
12. Commit transaction.
13. Release Redis lock.
14. Publish event to websocket consumers.

#### Deposit Lock Path

1. On first bid per company+auction, execute lock acquisition in bid transaction.
2. Update wallet balances: `available -> locked` with non-negative checks.
3. Enforce unique active lock for `(auction_id, company_id)`.
4. On auction close, release non-winner locks in settlement workflow transaction.
5. On winner default, move lock to penalty via ledger posting.

#### Payment Path

1. Create Stripe PaymentIntent for invoice.
2. Persist payment row with `Initiated` status and idempotency key.
3. Process webhook after signature validation.
4. Deduplicate by Stripe event id.
5. Transition payment state machine with transition guard.
6. On success, post ledger entry and emit `PaymentReceived`.
7. On failure, open retry window and escalate if needed.
8. At deadline expiry (`auction_closed_at + 48h`), enforce default and deposit burn.

#### Withdrawal Path

1. Buyer requests withdrawal with idempotency key.
2. Validate invariants: no active locks, no live participation, no outstanding invoices, no compliance hold, no open disputes, and no active blacklist status.
3. In one transaction reserve funds: `available -> pending_withdrawal`.
4. Create `deposit_withdrawal_requests` row.
5. On approval, call Stripe refund to original method.
6. On Stripe success, post ledger and mark `Completed`.
7. On terminal failure, rollback reservation and mark `Rejected`.

#### Settlement Path

1. Preconditions: payment succeeded, compliance checks pass, invoice closed.
2. In transaction, verify required ledger postings exist and are balanced.
3. Create payout instruction and settlement state update.
4. Post seller payout ledger movement.
5. Emit `SettlementCompleted` event.

### 2.3 Data Architecture

#### Write Model

1. Transactional Postgres tables as source of truth.
2. Strict state machines for `auctions`, `payments`, `withdrawals`, `settlements`.
3. All financial mutations are ledger-backed.
4. Outbox rows inserted in same transaction as authoritative state changes.

#### Read Model

1. Query-optimized read models in Postgres views/materialized views for admin/UI.
2. Search index receives async projections from event bus.
3. WebSocket stream derived from committed events only.

#### Partitioning Strategy

1. Partition by time for append-only high-volume tables:
   1. `bids` monthly
   2. `audit_logs` monthly
   3. `notification_attempts` monthly
   4. `risk_events` monthly
2. Keep hot partitions in faster storage tier.
3. Archive cold partitions with retention policies.

#### Append-Only Enforcement

1. DB triggers reject `UPDATE` and `DELETE` on append-only tables.
2. Application role lacks write permissions for prohibited operations.
3. Corrections are compensating records only.

#### Idempotency Strategy

1. Require idempotency key for all external mutation APIs (bid, payment action, withdrawal).
2. Persist request hash and response reference.
3. On retries with same key:
   1. same hash -> replay previous response
   2. different hash -> reject `409`

#### Outbox Pattern Usage

1. Any mutation with side effects writes outbox event in same DB transaction.
2. Publisher reads outbox in commit order and pushes to bus.
3. Consumer processing is idempotent with consumer checkpoints.

### 2.4 Concurrency Model

#### Locking Strategy

1. Redis lock on hot aggregate (`auction_id`) to reduce collision storms.
2. Postgres row-level lock on wallet and critical rows for authoritative integrity.
3. Unique constraints enforce final correctness (idempotency, active lock uniqueness).

#### Optimistic vs Pessimistic Decisions

| Area | Strategy | Rationale |
|---|---|---|
| Auction bid sequence/version | Optimistic (`version` compare-and-set) | High read/write concurrency with deterministic conflict handling |
| Wallet balance movement | Pessimistic (row lock in tx) | Prevent double-spend under concurrent requests |
| Payment webhook handling | Optimistic idempotent dedupe + guarded transitions | Replay-safe and high throughput |

#### Aggregate Key Ordering Guarantees

1. Event partition by `auction_id` for bid/auction events.
2. Event partition by `company_id` for wallet/deposit events.
3. Event partition by `payment_intent_id` for payment lifecycle.
4. Consumers assume in-partition order, not global order.

### 2.5 Financial Enforcement Architecture

#### Ledger Model

1. Double-entry immutable journal.
2. `ledger_entries` header plus `ledger_lines` details.
3. Balanced debits/credits required before commit.
4. Source reference unique per business command to block duplicate posting.

#### Transaction Boundaries

1. Bid command tx: deposit lock check/acquire + bid insert + auction version + outbox.
2. Payment success tx: payment state transition + ledger posting + outbox.
3. Withdrawal tx: reserve/release + request state + ledger posting + outbox.
4. Settlement tx: payout state + ledger posting + outbox.

#### Replay Protection

1. API idempotency keys persisted with request hash.
2. Stripe webhook dedupe by `stripe_event_id` unique constraint.
3. Ledger source uniqueness prevents reposting of same business command.

#### Double-Spend Prevention

1. Non-negative wallet checks in DB constraints.
2. Row-level locks on wallet rows during reserve/lock/release.
3. Unique active deposit lock per `(auction_id, company_id)`.
4. No financial command without corresponding idempotency record.

#### Stripe Webhook Integration Model

1. Verify signature using endpoint secret before parsing payload.
2. Insert webhook event record with unique event id.
3. If insert fails on unique key, acknowledge and drop as duplicate.
4. Map Stripe event to internal payment transition command.
5. Apply state guard and idempotent ledger posting.
6. Emit outbox event for downstream notifications.

### 2.6 Event & Notification Architecture

#### Outbox and Bus

1. Outbox table is authoritative bridge between tx DB and async bus.
2. Publisher uses batched polling with lease/claim semantics.
3. Failed publish retries with exponential backoff and dead-letter routing.

#### Consumer Idempotency

1. Consumer checkpoint table keyed by `(consumer_name, event_id)`.
2. Side-effect handler must be idempotent and safe on retries.
3. Financial consumers never mutate source-of-truth balances directly outside domain commands.

#### Notification SLA Enforcement

1. Trigger critical notifications within 60 seconds for payment deadlines and deposit burns.
2. Multi-channel fanout: email + SMS/WhatsApp + in-app.
3. Retry policy: 3 attempts over 30 minutes.
4. If all attempts fail, create escalation task in admin queue.
5. Persist delivery evidence for every attempt.

### 2.7 Security Architecture

#### Authn/Authz Model

1. JWT access tokens (short TTL) + rotating refresh tokens.
2. MFA required for admin roles.
3. Tenant-scoped role mapping: user permissions resolved in company context.
4. Region-scoped policy checks for operations requiring regional restrictions.

#### Multi-Tenant Isolation

1. Every business table includes tenant ownership (`company_id` or equivalent).
2. Repository layer enforces tenant filters on all reads/writes.
3. Admin cross-tenant actions require explicit elevated policy and audit reason.

#### Policy Enforcement Layer

1. No business handler executes before policy guard passes.
2. Core hard gates: approval status, blacklist status, deposit eligibility.
3. Policy decisions and denials logged immutably.

#### Secret Management

1. Secrets in cloud secret manager or vault; never in repo.
2. Rotation runbooks for JWT, Stripe, DB, Redis, and event bus credentials.
3. Startup fails fast when required secrets missing.

#### Edge Controls

1. WAF for bot and abuse filtering.
2. API rate limits per IP + per account + per route class.
3. Additional strict limits on financial and auth endpoints.

### 2.8 Compliance & Risk Layer

#### Compliance Hold Propagation

1. `compliance_hold` flag blocks bidding, withdrawal, and settlement.
2. Hold check is synchronous in policy layer.
3. Hold change emits event for cache invalidation and audit trace.

#### Risk Scoring Placement

1. Risk engine consumes events (login, bids, payment failures, geo mismatch).
2. Maintains current score table and append-only risk events.
3. Exposes synchronous read API for policy decisions on critical commands.

#### Geo-IP Reconciliation

1. Capture IP signals at login and bid submission.
2. Compare declared operating region with detected region.
3. On mismatch: log event, score increment, optional step-up verification.

#### Audit Immutability Enforcement

1. All privileged and financial actions append to `audit_logs`.
2. DB-level update/delete restriction on audit table.
3. Audit payload stores hash references of before/after snapshots.

---

## 3. Infrastructure Layout

### 3.1 Environments

| Environment | Purpose | Data Policy | External Integrations |
|---|---|---|---|
| Dev | Local feature development | Synthetic data only | Stripe test mode, local/managed shared non-prod services |
| Stage | Pre-production validation | Masked/anonymized realistic data | Full integration in test/sandbox mode |
| Prod | Live operations | Regulated production data | Production Stripe, messaging providers, WAF |

### 3.2 Containerization Strategy

1. Containerize app/API, workers, and websocket gateway separately.
2. Immutable image build with SBOM and vulnerability scanning.
3. One image per commit SHA; no mutable latest deployments.

### 3.3 CI/CD Pipeline

1. Pre-merge: lint, typecheck, unit tests, schema drift check.
2. Integration stage: migration apply + integration tests + webhook replay tests.
3. Release gate: financial invariant test suite must pass.
4. Progressive rollout: canary then regional rollout.
5. Automated rollback on SLO breach.

### 3.4 Database Topology

1. Postgres primary for writes.
2. Read replicas for non-critical read workloads.
3. PITR enabled with WAL archiving.
4. Online migrations with backward compatibility gates.

### 3.5 Redis Cluster Usage

1. Distributed locks for bidding aggregates.
2. Short-lived caches for rules and session metadata.
3. Rate limit counters.
4. Redis outage fallback: rely on DB constraints and reduced throughput mode.

### 3.6 WebSocket Scaling

1. Stateless websocket gateways.
2. Shared pub/sub backplane for event fanout.
3. Reconnect protocol with last-seen sequence for replay.

### 3.7 Observability Stack

1. Metrics: latency, error rate, queue lag, tx retries, lock contention.
2. Logs: structured JSON with correlation and idempotency IDs.
3. Traces: distributed tracing across API, DB, workers, Stripe webhook handlers.
4. Business SLO dashboards: bid acceptance latency, payment processing lag, notification SLA compliance.

### 3.8 Backup & Disaster Recovery

1. PITR with tested restore runbooks.
2. Daily full backups and cross-region copies.
3. Recovery drills monthly with measured RTO/RPO.
4. Target: RPO <= 5 minutes, RTO <= 30 minutes.

---

## 4. Implementation Phases

### Phase 0 — Foundation Hardening

| Item | Detail |
|---|---|
| Scope | Establish module boundaries, auth middleware skeleton, typed domain errors, transaction wrapper, env contract expansion |
| Risks | Boundary erosion if teams bypass service layer |
| Dependencies | Existing Module 1 scaffold |
| Validation Tests | Layering checks, auth middleware smoke tests, transaction wrapper tests |
| Exit Criteria | No direct DB writes from route handlers; mandatory request context and policy guard in mutation endpoints |

### Phase 1 — Financial Core

| Item | Detail |
|---|---|
| Scope | Deposit wallets/locks, ledger tables, invoice/payment models, Stripe integration, withdrawal state machine |
| Risks | Ledger drift, duplicate postings, race conditions |
| Dependencies | Phase 0 transaction and policy scaffolding |
| Validation Tests | Double-entry balance tests, idempotency replay tests, webhook duplicate tests, wallet non-negative invariant tests |
| Exit Criteria | All financial mutations ledger-backed; webhook replay-safe; no double-withdrawal under concurrency tests |

### Phase 2 — Auction Determinism

| Item | Detail |
|---|---|
| Scope | Formal auction state machine, bid_requests idempotency, optimistic versioning, anti-sniping, redis lock integration |
| Risks | Winner inconsistency at closing window |
| Dependencies | Phase 1 deposit lock availability |
| Validation Tests | Bid race tests, anti-sniping boundary tests, invalid transition rejection tests |
| Exit Criteria | Deterministic winner selection under load; no duplicate bids in retry storms |

### Phase 3 — Event Reliability

| Item | Detail |
|---|---|
| Scope | Outbox publisher, event bus integration, consumer idempotency, DLQ handling, websocket event projection |
| Risks | Event loss/duplication causing stale state |
| Dependencies | Phase 1 and 2 write models |
| Validation Tests | Outbox crash-recovery tests, consumer replay tests, DLQ replay tests |
| Exit Criteria | Zero lost committed events in fault-injection tests |

### Phase 4 — Risk & Compliance

| Item | Detail |
|---|---|
| Scope | Risk score engine, Geo-IP reconciliation, compliance hold propagation, AML trigger hooks |
| Risks | False positives and user friction |
| Dependencies | Phase 3 event stream |
| Validation Tests | Hold propagation tests, geo mismatch scoring tests, AML trigger threshold tests |
| Exit Criteria | Compliance hold blocks all restricted actions reliably; full audit trail for decisions |

### Phase 5 — Governance & Reporting

| Item | Detail |
|---|---|
| Scope | Regulatory exports, reconciliation reports, override governance, immutable audit explorer, chat support evidence export |
| Risks | Reporting inconsistency across data sources |
| Dependencies | Stable financial and risk event streams |
| Validation Tests | Report reconciliation diff tests, override policy tests, audit immutability tests |
| Exit Criteria | Reconciliation reports tie out with ledger and Stripe sources; override actions fully auditable |

### Phase 6 — Performance & Scale

| Item | Detail |
|---|---|
| Scope | Partitioning high-volume tables, hot-path isolation, query tuning, read model scaling, websocket horizontal scaling |
| Risks | Latency regressions during repartitioning |
| Dependencies | Functional completeness of phases 0-5 |
| Validation Tests | Load tests, soak tests, failover tests, chaos tests (redis/bus/db partial failures) |
| Exit Criteria | Meets NFRs: bid p95 < 500ms, real-time p95 < 1s, SLA notification compliance, resilience under failure drills |

---

## 5. Engineering Standards

### 5.1 Code Organization Rules

1. `app/` contains transport and presentation only.
2. `src/modules/<context>/application` contains use-case orchestration.
3. `src/modules/<context>/domain` contains entities, policies, state machines, invariants.
4. `src/modules/<context>/infrastructure` contains repositories and external adapters.
5. Cross-context calls occur via interfaces/events, not table-level coupling.

### 5.2 Module Boundary Rules

1. Controllers cannot import Prisma directly.
2. Repositories cannot enforce business policy; domain layer owns policy.
3. Shared utilities in `src/lib` must be domain-agnostic.

### 5.3 Transaction Boundary Rules

1. Every financial command executes in explicit transaction scope.
2. State mutation + ledger posting + outbox insert must be same transaction when logically coupled.
3. No external network call inside open DB transaction except tightly bounded cases with compensating strategy.

### 5.4 No-Direct-DB-in-Controller Policy

1. Route handlers call application services only.
2. Static analysis/lint rule blocks Prisma imports in `app/api/**`.

### 5.5 Idempotency Enforcement Standard

1. Mandatory `Idempotency-Key` for all mutation endpoints.
2. Persist `(actor, endpoint, key, request_hash, response_ref)`.
3. Replay behavior standardized across modules.

### 5.6 State-Machine Enforcement Standard

1. Every mutable aggregate with lifecycle must define transition matrix in domain layer.
2. Invalid transitions return deterministic domain error.
3. Transition history persisted append-only.

### 5.7 Audit Coverage Requirement

1. 100% coverage for financial mutations and admin privileged actions.
2. Audit records must include actor, action, entity, timestamp, correlation/idempotency IDs.
3. Audit table immutable at DB permission level.

### 5.8 Testing Requirements

1. Unit tests for domain invariants and state machines.
2. Integration tests for transaction boundaries and DB constraints.
3. End-to-end tests for bid, payment, withdrawal, settlement flows.
4. Property-based tests for ledger balance invariants.

### 5.9 Chaos Testing Requirements

1. Kill consumer during outbox publish and verify replay correctness.
2. Inject duplicate Stripe webhooks and verify idempotent outcomes.
3. Simulate Redis unavailability during bid bursts and verify DB-level correctness.
4. Simulate DB failover and validate RPO/RTO objectives.

### 5.10 Required Pre-Production Gates

1. Financial invariant suite must pass with zero critical failures.
2. Security checks: JWT/MFA/authz and rate limits validated.
3. Audit immutability and reconciliation reports validated.
4. Disaster recovery drill pass within RTO/RPO targets.
