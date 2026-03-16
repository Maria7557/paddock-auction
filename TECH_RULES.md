# TECH_RULES.md

## 0. Normative Interpretation, Priority, and Exception Control

### 0.0 Deployment Safety (P0, mandatory)
1. All deployment operations MUST follow `DEPLOY_RULES.md`.
2. All agents MUST read `DEPLOY_RULES.md` before any deploy-related task.
3. `docker compose up --build -d --force-recreate` is FORBIDDEN in production.
4. `docker system prune -a` is FORBIDDEN in production.
5. `docker compose down` is FORBIDDEN in production without explicit approval.
6. App services (frontend, backend) MUST be deployed with `--no-deps` flag only.
7. `caddy` MUST always be defined in `docker-compose.yml` as a managed service, never an orphan container.
8. `Caddyfile` MUST always exist in the repository root as a file, not a directory.

### 0.1 Normative Keywords
1. `MUST` and `MUST NOT` are absolute requirements.
2. `REQUIRED` is equivalent to `MUST`.
3. `SHOULD` is allowed only with a valid Architecture Waiver Record (AWR).
4. Lowercase normative words (`must`, `should`, `required`) are interpreted using this section.
5. Rule identifier format is `S<section>.<item>` (example: `S4.2` means section 4, item 2).

### 0.2 Priority Tiers (Rules Sorted by Importance)
1. `P0` Financial correctness, integrity, and non-bypass security.
2. `P1` Determinism, lifecycle consistency, compliance reliability.
3. `P2` Scalability, operability, maintainability, and delivery governance.
4. Section priority mapping:
| Priority | Sections |
|---|---|
| P0 | 1, 2, 3, 4, 6 |
| P1 | 5, 7, 8, 9, 10 |
| P2 | 11, 12, 13, 14, 15 |
5. Within each section, rules are ordered high to low impact.
6. On conflict, higher priority wins (`P0 > P1 > P2`).
7. If a subsection explicitly declares `(P0|P1|P2)`, that explicit priority overrides section default.

### 0.3 Exception Control
1. Any exception requires an AWR linked in the PR.
2. AWR MUST include: affected rule id, justification, risk, mitigation, owner, expiry, rollback plan.
3. AWR validity MUST NOT exceed 14 calendar days.
4. Expired AWRs invalidate the change.
5. Verbal/chat approvals are invalid.
6. CI bypass, force merge, or disabled checks are invalid exception mechanisms.

### 0.4 Machine-Readable Governance Files
1. `docs/architecture/ownership/table_ownership.yaml` is REQUIRED.
2. `docs/architecture/seo/tier1_pages.yaml` is REQUIRED.
3. `docs/architecture/perf/hot_paths.yaml` is REQUIRED.
4. `src/modules/compliance/domain/risk_thresholds.ts` is REQUIRED.
5. `docs/architecture/quality/critical_financial_modules.yaml` is REQUIRED.
6. `docs/architecture/quality/architecture_significant_paths.yaml` is REQUIRED.
7. `docs/architecture/ownership/shared_paths.yaml` is REQUIRED.
8. `docs/architecture/standards/primary_sources.yaml` is REQUIRED.
9. `docs/architecture/seo/page_policy_registry.yaml` is REQUIRED.
10. CI MUST fail if these files are missing or invalid.
11. Required governance files MUST NOT remain semantically empty once corresponding runtime artifacts exist (routes, tables, critical modules, or hot paths).

### 0.5 Primary-Source Standards Baseline (Stack-Correlated)
1. Normative implementation behavior MUST follow primary sources for each stack component.
2. Primary-source matrix:
| Component | Primary Source Standard | Required Scope | Currency Policy |
|---|---|---|---|
| Node.js runtime | Official Node.js docs + release schedule | runtime semantics, LTS lifecycle, security advisories | verify every 14 days |
| Next.js App Router | Official Next.js docs + release notes | routing, SSR/SSG, metadata, runtime behavior | verify every 30 days |
| TypeScript | Official TypeScript handbook + release notes | type system, compiler options, strictness semantics | verify every 30 days |
| Prisma | Official Prisma docs + migration guides | schema modeling, client behavior, migrations | verify every 30 days |
| PostgreSQL | Official PostgreSQL docs (deployed supported major) | transactions, locking, constraints, partitioning | verify every 14 days |
| Redis | Official Redis docs | locking semantics, expiration semantics, operational constraints | verify every 30 days |
| Stripe | Official Stripe API docs | PaymentIntents, refunds, webhook signatures, replay handling | verify every 14 days |
| Event bus provider | Official provider docs for chosen bus (Kafka/SQS/etc.) | delivery semantics, ordering, retries, DLQ | verify every 30 days |
| Observability | OpenTelemetry specification | trace/metric/log correlation standards | verify every 30 days |
| JWT/Auth tokens | RFC 7519 + RFC 8725 | token validation and security best practices | verify every 14 days |
| Security baseline | OWASP ASVS current stable | application security control baseline | verify every 30 days |
3. `docs/architecture/standards/primary_sources.yaml` is REQUIRED.
4. For each component in rule `S0.5.2`, `primary_sources.yaml` MUST include: `component`, `deployed_version`, `target_version`, `version_policy`, `release_channel`, `source_reference`, `last_verified_at_utc`, `next_review_due_utc`, `owner`.
5. `release_channel` MUST be one of: `LTS`, `Stable`, `Current`.
6. `deployed_version` MUST match lockfile/runtime manifest for the deployed environment.
7. `target_version` MUST be greater than or equal to `deployed_version`.
8. Code changes that alter behavior for a component MUST reference corresponding `primary_sources.yaml` entry in PR description.
9. Secondary sources (blogs, forum posts, generated text) MUST NOT override primary-source standards.
10. If primary source and local rule conflict, stricter local rule prevails unless superseded by approved ADR.
11. If primary source and local rule are incompatible due to vendor/runtime change, implementation is blocked until ADR updates rule set.

### 0.6 Primary-Source CI/PR Enforcement
1. CI MUST fail if `primary_sources.yaml` is missing or schema-invalid.
2. CI MUST fail if any `next_review_due_utc` is in the past.
3. CI MUST fail if dependency versions in lockfile/runtime manifest diverge from `deployed_version`.
4. CI MUST fail if dependency major version changes occur without corresponding `target_version` update and approved ADR.
5. PRs changing framework/runtime/dependency versions MUST include standards update in `primary_sources.yaml`.
6. PRs changing Stripe, Postgres, JWT, or Node major/minor versions MUST include explicit backward-compatibility test evidence.
7. Dependency or runtime upgrades sourced only from non-primary references MUST fail CI policy check.

## 1. Architectural Doctrine

### 1.1 Source of Truth Hierarchy (P0)
1. Authority order is immutable:
| Rank | Authority | Allowed | Forbidden |
|---|---|---|---|
| 1 | PostgreSQL primary transactional state | Command preconditions and commit truth | None |
| 2 | Immutable ledger | Financial truth and reconciliation | Non-financial authority |
| 3 | State transition history | Lifecycle legality and replay proof | Replacing aggregate current state |
| 4 | Outbox | Post-commit side-effect source | Financial truth source |
| 5 | Event bus | Async transport | Financial command authority |
| 6 | Read models/search | Query optimization | Authorization and financial checks |
| 7 | WebSocket projections | UI hints | Any command authority |
2. Financial preconditions MUST read from PostgreSQL primary only.
3. Event, read model, and websocket data MUST NOT be used as financial authority.

### 1.2 Failure Atomicity Doctrine (P0)
1. Financial commands MUST be atomic in one DB transaction.
2. Partial success is forbidden.
3. Best-effort financial writes are forbidden.
4. Silent compensation is forbidden.
5. If any invariant fails, transaction MUST rollback fully.
6. If ledger write fails, business mutation MUST rollback.
7. If required outbox write fails, transaction MUST rollback.
8. External side effects MUST occur after commit.

### 1.3 Financial Invariant Doctrine (P0)
1. `NO DEPOSIT = NO BID` is absolute.
2. Every financial mutation MUST be ledger-backed before response success.
3. Every financial command MUST be idempotent.
4. Every lifecycle mutation MUST pass transition validation.
5. Compliance hold MUST synchronously block bidding, withdrawal, settlement.
6. Approval, blacklist, and deposit gates MUST run on every bid path, including admin-originated requests.
7. Financial and privileged actions MUST write immutable audit entries.
8. Business invariant definitions are canonical in `PRD_v2.0.md` (`INV-*`, `FIN-INV-*`, `DATA-INV-*`); this document defines enforcement obligations only.

### 1.4 Searchability, SEO, and Rendering Doctrine (P0, strict)
1. Every route MUST be classified in `docs/architecture/seo/page_policy_registry.yaml` before merge.
2. `SEARCHABLE` means intended for discovery/indexing by internet search engines and entry by anonymous browser sessions from search results.
3. Classification schema is mandatory:
| Field | Allowed Values | Meaning |
|---|---|---|
| `route_pattern` | Next.js route pattern | Route scope |
| `visibility` | `PUBLIC` / `PRIVATE` | Browser-accessible without auth vs auth-required |
| `searchability` | `SEARCHABLE` / `NON_SEARCHABLE` | Intended for search engine indexing |
| `rendering_policy` | `SSR_REQUIRED` / `SSR_FORBIDDEN` / `SSR_EXCEPTION_AWR` | Rendering constraint |
| `seo_profile` | `FULL_SEO` / `NO_SEO` | Metadata and indexing profile |
| `sitemap_inclusion` | `INCLUDE` / `EXCLUDE` | Sitemap behavior |
| `owner` | team id | Accountability |
4. Decision algorithm for any new page is deterministic:
| Step | Condition | Result |
|---|---|---|
| 1 | Route requires auth to load | `PRIVATE` + `NON_SEARCHABLE` + `SSR_FORBIDDEN` + `NO_SEO` + `EXCLUDE` |
| 2 | Route is a public listing or detail page intended for search discovery | `PUBLIC` + `SEARCHABLE` + `SSR_REQUIRED` + `FULL_SEO` + `INCLUDE` |
| 3 | Route is public but not intended for search (e.g. login, register) | `PUBLIC` + `NON_SEARCHABLE` + `SSR_FORBIDDEN` + `NO_SEO` + `EXCLUDE` |
5. A page classified `SEARCHABLE` MUST render indexable content in SSR/SSG first response.
6. A page classified `NON_SEARCHABLE` MUST emit `noindex,nofollow` and MUST NOT appear in sitemap.
7. Classification MUST be added before merge, not after.
8. Reclassification requires explicit ADR if the route has been live for more than 14 days.

### 1.5 Architecture Boundary Rules (P0)
1. Next.js App Router is UI-only: no Prisma imports, no direct DB calls, no `route.ts` files outside designated API surface.
2. All data access goes through `src/lib/api-client.ts` → Fastify backend on port 4000.
3. Fastify backend owns all Prisma calls, business logic, and DB transactions.
4. No cross-context direct table mutation.
5. Financial logic MUST NOT exist in Next.js layer.

## 2. Financial Command Rules (P0)

1. Every financial command MUST have an idempotency key.
2. Idempotency key MUST be validated before any mutation.
3. Same key + different payload MUST be rejected.
4. Financial commands MUST be retryable without side-effect duplication.
5. Command handlers MUST be stateless with respect to in-memory state.
6. Financial commands MUST write to the immutable ledger before returning success.
7. Ledger entries MUST be append-only.
8. Financial command response MUST reflect committed DB state only.

## 3. Bid Engine Rules (P0)

1. Bid submission MUST verify deposit approval before processing.
2. Bid MUST be rejected if buyer deposit is not admin-approved.
3. Bid amount MUST be validated against current highest bid atomically.
4. Bid MUST be written with row-level lock on auction aggregate.
5. Duplicate bid (same buyer, same amount, same auction) MUST be idempotently rejected.
6. Bid state transitions MUST follow defined state machine.
7. Outbid notification MUST be triggered after commit, not inside transaction.
8. Real-time bid update MUST be published after commit via WebSocket pub/sub.

## 4. Deposit and Wallet Rules (P0)

1. Deposit amount is fixed per auction and MUST NOT be configurable by buyer.
2. Deposit MUST be held until auction settlement or explicit release.
3. Deposit release MUST be ledger-backed.
4. Wallet balance MUST be derived from ledger, not from a mutable balance column.
5. Withdrawal MUST check compliance hold before processing.
6. Deposit refund on non-winning bid MUST be automatic post-settlement.
7. Deposit burn on winning bid MUST be part of settlement transaction.

## 5. Stripe Integration Rules (P1)

1. Webhook signature MUST be verified on every event.
2. Webhook handler MUST be idempotent using Stripe event ID.
3. PaymentIntent status MUST be reconciled against DB state after each webhook.
4. Refund MUST be initiated via Stripe API, not manual ledger entry.
5. Stripe errors MUST be logged with correlation ID and surfaced to ops.
6. No financial state MUST be updated before webhook signature passes.

## 6. State Machine Rules (P0)

1. Every aggregate with lifecycle MUST have an explicit state machine definition.
2. Invalid transitions MUST be rejected with a typed error.
3. State transition MUST be atomic with associated side effects in same transaction.
4. Terminal states MUST be immutable.
5. State history MUST be append-only.

## 7. API Contract Rules (P1)

1. All API responses MUST include a correlation ID.
2. Error responses MUST follow a typed error schema.
3. Paginated endpoints MUST return total count and cursor.
4. Mutation endpoints MUST validate input with a typed schema before processing.
5. API versioning MUST be explicit if breaking changes are introduced.

## 8. Auth and Authorization Rules (P1)

1. JWT MUST be validated on every protected request.
2. Role claims MUST be verified against DB state for privileged operations.
3. Admin-only endpoints MUST reject non-admin tokens even if structurally valid.
4. Session tokens MUST NOT be stored in localStorage.
5. Token expiry MUST be enforced server-side.
6. Refresh token rotation MUST invalidate previous token on use.

## 9. Data Integrity Rules (P1)

1. Foreign key constraints MUST be enforced at DB level.
2. Unique constraints MUST be enforced at DB level, not application level only.
3. Nullable fields MUST have explicit justification in schema comments.
4. Enum values MUST be defined at DB level where possible.
5. Migrations MUST be reversible unless explicitly marked irreversible with justification.
6. Destructive migrations on financial or audit tables are FORBIDDEN.

## 10. Event and Outbox Rules (P1)

1. Outbox write MUST be in the same transaction as the business mutation.
2. Outbox processor MUST be idempotent.
3. Failed outbox events MUST be retried with exponential backoff.
4. Dead-letter events MUST be logged and alerted.
5. Event consumers MUST be idempotent using event ID.
6. Event schema changes MUST be backward-compatible or versioned.

## 11. Observability Rules (P1)

### 11.1 Tracing and Metrics (P1)
1. Every API request MUST emit a trace with correlation ID.
2. Financial command traces MUST include: user ID, auction ID, amount, outcome.
3. DB query latency MUST be tracked per endpoint.
4. Traces MUST connect API, DB transaction, outbox publish, and consumers.

### 11.2 Audit and Security (P1)
1. Financial and privileged actions MUST be audit-logged.
2. Audit storage MUST be immutable and queryable.
3. Missing required audit write MUST fail command.
4. Audit timestamps MUST be UTC and server-generated.
5. Secrets/PII MUST be redacted in logs/traces/metric labels.

### 11.3 SEO and Searchability Telemetry (P0)
1. `SEARCHABLE` pages MUST emit telemetry for indexability, canonical, hreflang, schema presence, sitemap status, and CWV per locale.
2. `NON_SEARCHABLE` pages MUST emit telemetry proving `noindex,nofollow` and sitemap exclusion.
3. Telemetry MUST include page class from `page_policy_registry.yaml` and route identifier.
4. CWV telemetry per deploy and per locale is mandatory for all `SEARCHABLE` pages.

### CI/PR Enforcement
1. Financial endpoint PRs MUST include telemetry and audit contract tests.
2. SEO regression checks and CWV budget checks are mandatory for `SEARCHABLE` page changes.
3. CI MUST fail if route-to-policy classification is missing or mismatched with implemented metadata/rendering behavior.
4. CI MUST fail if a `SEARCHABLE` page lacks SSR/SSG first-response content.
5. CI MUST fail if a `NON_SEARCHABLE` page emits indexable metadata or appears in sitemap.
6. CI MUST generate route inventory from Next.js App Router (`app/**/page.*`) and enforce exact coverage against `page_policy_registry.yaml`.
7. CI MUST fail if `tier1_pages.yaml` and `SEARCHABLE` registry projection are not identical.
8. Log-redaction tests are mandatory.

## 12. Service Extraction Readiness Rules

1. Context interfaces MUST be explicit and versioned.
2. Inter-context contracts MUST be contract-tested.
3. Persistence MUST remain encapsulated by owning context.
4. Shared-write contracts across contexts are forbidden.
5. Extraction plans MUST define data ownership cutlines before runtime split.
6. Extraction MUST NOT alter financial invariants or authority hierarchy.

### CI/PR Enforcement
1. Dependency graph checks enforce no forbidden imports.
2. Contract/version migration tests are required for extraction-related changes.

## 13. Testing, Chaos, and Failure Injection Requirements

### 13.1 TDD-First (P1, mandatory)
1. Behavioral tests MUST be written before implementation code.
2. PR MUST include failing-test artifact followed by passing-test artifact in same PR.
3. Implementation-first PRs are rejected.

### 13.2 Required Test Matrix
1. Unit tests for domain invariants and transitions.
2. Integration tests for transaction boundaries and DB constraints.
3. E2E tests for bid/payment/withdrawal/settlement/hold paths.
4. Property-based tests for ledger balancing.
5. Concurrency tests for duplicate bid/withdrawal prevention.
6. Webhook replay tests.
7. Outbox crash-recovery tests.
8. Redis outage correctness tests.
9. Failover drills validating RPO/RTO.
10. Performance tests for hot paths listed in `hot_paths.yaml`.
11. Route classification tests asserting `page_policy_registry.yaml` compliance for every public route.
12. SEO rendering tests asserting `SEARCHABLE` pages have SSR/SSG indexable content and `NON_SEARCHABLE` pages enforce `noindex,nofollow`.

### 13.3 Coverage Gates
1. Domain+application line coverage `>= 85%`.
2. Critical financial module branch coverage `>= 90%`.
3. Critical financial modules are exactly those listed in `docs/architecture/quality/critical_financial_modules.yaml`.

### CI/PR Enforcement
1. Changed-files policy MUST require corresponding tests.
2. Missing mandatory test classes MUST fail CI.
3. Coverage gate failures MUST fail CI.

## 14. Strictly Forbidden Anti-Patterns

1. Direct DB writes in route handlers.
2. Business policy in controllers/repositories.
3. Financial mutation without transaction wrapper.
4. Financial mutation without ledger write.
5. Direct status assignment bypassing state machine.
6. Command-side direct event-bus publish.
7. Mutation endpoint without idempotency key.
8. Same idempotency key with different payload accepted as success.
9. Financial authority from event bus/read model/websocket/cache.
10. Best-effort or partial financial writes.
11. Silent compensation without audit and compensating ledger entry.
12. Admin bypass of approval/blacklist/deposit/compliance hold gates.
13. Update/delete on append-only data.
14. Destructive migration on financial or audit history.
15. Missing correlation id or required audit record.
16. Network call inside open financial transaction.
17. Cross-context direct table mutation.
18. CI gate bypass on protected branches.
19. `SEARCHABLE` page changes without SEO and CWV checks.
20. Writing implementation before behavioral tests.
21. Creating redundant folder/module structures for existing responsibilities.
22. Manual mutation of immutable ledger/audit records.
23. Global mutable singleton state for business invariants or policy decisions.
24. Framework/runtime/dependency behavior changes without primary-source update and verification record.
25. Shipping a route without `page_policy_registry.yaml` classification.
26. Marking a page `SEARCHABLE` without SSR/SSG first-response indexable HTML.
27. Marking a page `NON_SEARCHABLE` while emitting canonical/hreflang/schema or sitemap inclusion.

## 15. Long-Term Technical Scope & Quality Standards

### 15.1 Scope Governance
1. Work MUST stay within approved scope (`PRD + TECH_PLAN + TECH_RULES`).
2. New architecture scope requires approved ADR before implementation.
3. Unapproved scope expansion is forbidden.

### 15.2 Code and Platform Quality
1. Protected branches MUST enforce quality gates: lint, typecheck, tests, security scan, dependency policy, migration checks, architecture checks.
2. Runtime/framework versions MUST remain actively supported.
3. Security-critical dependency advisories MUST be patched within 7 days.
4. Non-critical dependency upgrades MUST be reviewed monthly.
5. Deprecated APIs MUST include deprecation metadata, owner, and removal date.
6. Financial-domain PRs REQUIRE at least 2 reviewers, including designated architecture owner.
7. New dependency introduction REQUIRES corresponding primary-source entry and compatibility impact statement.

### 15.3 Objective Maintainability Budgets
1. Maximum domain/application function cyclomatic complexity: `12`.
2. Maximum domain/application file length: `500` lines.
3. Duplicate logic threshold in changed domain/application files: `<= 3%`.
4. Hot-path performance budgets apply only to endpoints listed in `hot_paths.yaml`.

### 15.4 Documentation-as-Code
1. Architecture-significant behavior changes MUST update architecture docs in same PR.
2. New invariants MUST include tests and rule references.
3. New financial commands MUST include replay/failure runbook notes.
4. Architecture-significant paths are exactly those listed in `docs/architecture/quality/architecture_significant_paths.yaml`.

### CI/PR Enforcement
1. ADR-required labels MUST block merge until approved ADR is linked.
2. Missing docs update on architecture-significant change MUST fail CI.
3. Reviewer policy failures MUST fail merge.
4. Complexity/file-size/duplication budget failures MUST fail CI.
