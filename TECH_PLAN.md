# TECH_PLAN — UAE B2B Vehicle Auction Platform (Financially Enforced)

## Current Production State (as of March 2026)

> **Note:** This document describes both the current running architecture and the
> planned target architecture. Sections marked `[PLANNED]` describe future state
> that is not yet deployed. Current production runs on a DigitalOcean VPS with
> Docker Compose. Vercel, Neon, and serverless references from earlier versions
> of this document have been superseded by the VPS/Docker setup.

### Currently Running in Production

| Service | Technology | Port | Notes |
|---|---|---|---|
| frontend | Next.js 16, Docker | 3000 | UI only — no Prisma, no route.ts |
| backend | Fastify, Docker | 4000 | All business logic, Prisma, DB access |
| postgres | PostgreSQL 16, Docker | 5432 | Primary DB on VPS |
| caddy | Caddy 2, Docker | 80/443 | Reverse proxy + TLS |

### Not Yet Deployed (Planned)

- Redis Cluster
- Event Bus (Kafka/RabbitMQ/SQS)
- WebSocket Gateway
- S3-compatible Object Storage
- OpenSearch/Elasticsearch
- CI/CD Pipeline (GitHub Actions)
- Stripe (partially integrated, not fully live)

---

## 1. Technology Stack Description

### 1.1 Selected Stack

| Layer | Selected Technology | Why Selected | Alternatives Considered | Rejected Because | Scaling Characteristics | Financial Integrity Implications |
|---|---|---|---|---|---|---|
| Web/App Runtime | Next.js App Router (TypeScript) | Unified SSR + API surface, strong TypeScript ecosystem, fast iteration on monolith boundary | NestJS + React SPA, Go + gRPC + SSR BFF | Higher integration cost at current team maturity; slower initial delivery | Horizontal stateless scaling behind LB; route-level caching controls | SSR/API co-location reduces cross-service consistency bugs in early phases |
| Language | TypeScript | Type-level contracts across API/domain/infrastructure | Go, Kotlin | Team/tooling baseline already TypeScript | Good dev velocity; runtime overhead acceptable for current profile | Strong typing reduces financial schema/DTO mismatch risk |
| Primary DB | PostgreSQL | Strong transactions, row locking, mature indexing/partitioning, reliable durability | MySQL, CockroachDB, MongoDB | MySQL weaker ecosystem fit for planned append-only/audit patterns; Cockroach operational complexity; Mongo unsuitable for strict financial relational guarantees | Vertical + read-replica + partitioning path; can support 100k+ users with correct schema/index strategy | ACID boundaries are required for atomic lock/bid/ledger/outbox writes |
| ORM | Prisma | Migration tooling, typed data access, fast iteration | Drizzle, raw SQL-only | Raw SQL-only slows initial delivery; Drizzle migration/maturity tradeoffs for this team | Acceptable at this stage; use targeted raw SQL for hot paths | Must be wrapped by transaction boundary rules; cannot allow ad-hoc writes from handlers |
| Cache + Dist Lock | Redis Cluster `[PLANNED]` | Low-latency lock and cache primitives | Postgres advisory locks only, ZooKeeper | Postgres-only locking can bottleneck under bid bursts; ZooKeeper overkill | Scales horizontally; lock granularity by aggregate keys | Secondary lock layer reduces race risk in bid path; DB remains source of truth |
| Payments | Stripe (PaymentIntents + Webhooks) `[PLANNED - not fully live]` | Strong UAE-compatible rails, mature webhook lifecycle, refund APIs | Adyen, Checkout.com, custom bank integration | Integration complexity/time; weaker immediate ecosystem fit | Scales externally; internal backpressure required on webhook consumers | Must enforce signature verification, replay dedupe, idempotent posting |
| Event Transport | Managed Event Bus `[PLANNED]` | Async decoupling, retries, partitioning by key | DB polling only, synchronous fanout | Tight coupling, high latency, operational fragility | Partitioned consumers and horizontal scaling | Use outbox + idempotent consumers for financial correctness |
| Real-time | WebSocket Gateway `[PLANNED]` | Required for auction bid updates | Polling only, SSE only | Polling load spikes near auction end; SSE one-way limits | Horizontally scalable gateways with shared pub/sub | Real-time channel is non-authoritative; commit log stays in DB |
| Blob Storage | S3-compatible Object Storage `[PLANNED]` | Durable inspection media and evidence storage | Local filesystem, DB blobs only | Operational risk and high DB bloat | Highly scalable object store with lifecycle policies | Evidence immutability anchors compliance and disputes |
| Search | OpenSearch/Elasticsearch `[PLANNED, phase-gated]` | Read-model search for listings and filtering | Postgres full-text only | Limited relevance and scaling flexibility | Horizontal cluster scaling; async indexing | Search is read-only derivative; no financial authority |
| Edge + Protection | API Gateway + WAF `[PLANNED]` | Consistent authn/authz guardrails and abuse control | App-only middleware | Harder to enforce uniform limits and observability | Horizontally scalable edge controls | Prevents brute-force/idempotency abuse on financial endpoints |

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

#### Currently Deployed Runtime Components

1. Next.js frontend (UI only)
2. Fastify backend (API, business logic, Prisma)
3. PostgreSQL (primary DB)
4. Caddy (reverse proxy + TLS)

#### Planned Runtime Components `[PLANNED]`

5. AuthN/AuthZ + Policy Engine (partial — JWT in backend)
6. Auction Engine
7. Bidding Engine
8. Deposit & Wallet Service
9. Payment Orchestrator (Stripe)
10. Immutable Ledger Service
11. Settlement Service
12. Region Rules Engine
13. Risk & Compliance Engine
14. Notification Orchestrator
15. Reporting & Governance Service
16. WebSocket Gateway
17. Scheduler/Workflow Worker
18. Redis Cluster
19. Event Bus + DLQ
20. Object Storage
21. Search Index (derived read model)

#### Architecture Boundary Rules (enforced now)

1. Next.js = UI only. No Prisma imports. No `route.ts` files. No direct DB calls.
2. All data access: `src/lib/api-client.ts` → Fastify backend on port 4000.
3. Fastify backend owns all Prisma calls, business logic, DB transactions.
4. Financial logic MUST NOT exist in Next.js layer.

#### Interaction Diagram (Target Architecture)

```text
[Client UI SSR + API calls]
        |
        v
[Caddy Proxy] -> [Next.js :3000] -> [Fastify :4000]
                                          |
                                    [PostgreSQL]
                                    (currently deployed)

[PLANNED additions:]
[Fastify] -> [Redis Lock] -> [PostgreSQL]
[Fastify] -> [Outbox] -> [Event Bus] -> [Consumers]
[Consumers] -> [WebSocket Gateway] -> [Client]
[Fastify] -> [Stripe API]
[Stripe] -> [Webhook] -> [Fastify]
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

### 2.2 Core Execution Paths

#### Atomic Bid Flow (Target)

1. Client sends bid with `Idempotency-Key` and JWT.
2. Policy layer validates approval, blacklist, company scope, auction state.
3. Service acquires Redis lock on `auction_id`. `[PLANNED — currently Postgres only]`
4. Start DB transaction.
5. Upsert/fetch `bid_requests` by `(auction_id, company_id, idempotency_key)`.
6. If request already succeeded with same payload hash, return stored response.
7. Validate current auction version and bid increment rules.
8. Acquire or validate active deposit lock atomically.
9. Insert append-only bid record.
10. Optimistically update auction version and end time extension if anti-sniping applies.
11. Insert outbox event `BidPlaced`. `[PLANNED]`
12. Commit transaction.
13. Release Redis lock. `[PLANNED]`
14. Publish event to websocket consumers. `[PLANNED]`

---

## 3. Infrastructure and Deployment

### 3.1 Current Production Infrastructure

| Component | Details |
|---|---|
| Server | DigitalOcean VPS, Ubuntu 24.04 |
| IP | 152.42.128.106 |
| App path | /app |
| Domain | fleetbid.ae |
| API domain | api.fleetbid.ae |
| Container runtime | Docker + Docker Compose |
| Deploy branch | codex/newback |
| Deploy method | Manual SSH + git pull |

### 3.2 Deployment Rules

All deployment operations MUST follow `DEPLOY_RULES.md`. That document is the
authoritative source for safe deploy procedures.

### 3.3 Planned Infrastructure Upgrades `[PLANNED]`

1. CI/CD via GitHub Actions (build images, push to registry, deploy via SSH)
2. Docker image registry (GitHub Container Registry or Docker Hub)
3. Pre-built images to avoid `next build` on VPS (eliminates OOM kills)
4. Redis on VPS or managed Redis
5. Automated health checks and alerting
6. Database backups (PITR target: RPO <= 5 minutes, RTO <= 30 minutes)

---

## 4. Implementation Phases

### Phase 0 — Foundation Hardening (current)

| Item | Detail |
|---|---|
| Scope | Module boundaries, auth middleware, typed domain errors, transaction wrapper |
| Status | In progress |
| Exit Criteria | No direct DB writes from route handlers; mandatory request context and policy guard in mutation endpoints |

### Phase 1 — Financial Core

| Item | Detail |
|---|---|
| Scope | Deposit wallets/locks, ledger tables, invoice/payment models, Stripe integration, withdrawal state machine |
| Status | Planned |
| Exit Criteria | All financial mutations ledger-backed; webhook replay-safe; no double-withdrawal under concurrency tests |

### Phase 2 — Auction Determinism

| Item | Detail |
|---|---|
| Scope | Formal auction state machine, bid_requests idempotency, optimistic versioning, anti-sniping, redis lock integration |
| Status | Planned |
| Exit Criteria | Deterministic winner selection under load; no duplicate bids in retry storms |

### Phase 3 — Event Reliability

| Item | Detail |
|---|---|
| Scope | Outbox publisher, event bus integration, consumer idempotency, DLQ handling, websocket event projection |
| Status | Planned |
| Exit Criteria | Zero lost committed events in fault-injection tests |

### Phase 4 — Risk & Compliance

| Item | Detail |
|---|---|
| Scope | Risk score engine, compliance hold propagation, AML trigger hooks |
| Status | Planned |
| Exit Criteria | Compliance hold blocks all restricted actions reliably; full audit trail |

### Phase 5 — Governance & Reporting

| Item | Detail |
|---|---|
| Scope | Regulatory exports, reconciliation reports, immutable audit explorer |
| Status | Planned |
| Exit Criteria | Reconciliation reports tie out with ledger and Stripe sources |

### Phase 6 — Performance & Scale

| Item | Detail |
|---|---|
| Scope | Partitioning, hot-path isolation, query tuning, websocket horizontal scaling |
| Status | Planned |
| Exit Criteria | bid p95 < 500ms, real-time p95 < 1s, resilience under failure drills |

---

## 5. Engineering Standards

### 5.1 Code Organization Rules

1. `app/` contains transport and presentation only (Next.js).
2. `backend/src/routes/` contains Fastify route handlers.
3. Business logic lives in Fastify backend — never in Next.js layer.
4. `src/lib/api-client.ts` is the only bridge from Next.js to backend.
5. Cross-context calls occur via service APIs or events, never direct table writes.

### 5.2 Module Boundary Rules

1. Next.js components cannot import Prisma directly — ever.
2. No `route.ts` files in Next.js app directory.
3. Repositories cannot enforce business policy; domain layer owns policy.
4. Shared utilities in `src/lib` must be domain-agnostic.

### 5.3 Transaction Boundary Rules

1. Every financial command executes in explicit transaction scope.
2. State mutation + ledger posting + outbox insert must be same transaction when logically coupled.
3. No external network call inside open DB transaction.

### 5.4 Idempotency Enforcement Standard

1. Mandatory `Idempotency-Key` for all mutation endpoints.
2. Persist `(actor, endpoint, key, request_hash, response_ref)`.
3. Replay behavior standardized across modules.

### 5.5 State-Machine Enforcement Standard

1. Every mutable aggregate with lifecycle must define transition matrix.
2. Invalid transitions return deterministic domain error.
3. Transition history persisted append-only.

### 5.6 Audit Coverage Requirement

1. 100% coverage for financial mutations and admin privileged actions.
2. Audit records must include actor, action, entity, timestamp, correlation IDs.
3. Audit table immutable at DB permission level.
