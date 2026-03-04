# TECH_RULES.md

## 0. Normative Interpretation, Priority, and Exception Control

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
| 1 | Route requires authentication OR exposes user/company-specific state OR contains transactional/private data | `visibility=PRIVATE`, `searchability=NON_SEARCHABLE`, `seo_profile=NO_SEO`, `rendering_policy=SSR_FORBIDDEN` |
| 2 | Route is intended as search entry page for public discovery traffic | `visibility=PUBLIC`, `searchability=SEARCHABLE`, `seo_profile=FULL_SEO`, `rendering_policy=SSR_REQUIRED` |
| 3 | All other routes | `searchability=NON_SEARCHABLE`, `seo_profile=NO_SEO`, `rendering_policy=SSR_FORBIDDEN` |
5. `SEARCHABLE` pages MUST be listed in both `page_policy_registry.yaml` and `tier1_pages.yaml`.
6. `tier1_pages.yaml` MUST be an exact projection of all `SEARCHABLE` routes from `page_policy_registry.yaml`.
7. `SEARCHABLE` pages MUST use server-rendered HTML on first response (`SSR` or `SSG/ISR`) and MUST NOT rely on client-only rendering for primary indexable content.
8. `SEARCHABLE` pages MUST provide: canonical, hreflang (`en`,`ru`,`ar`), robots index directive, structured data, sitemap inclusion, and locale URL consistency.
9. `SEARCHABLE` pages MUST meet CWV hard gates: `LCP < 2.5s`, `CLS < 0.1`, `INP < 200ms`.
10. `FULL_SEO` profile is explicit and mandatory: canonical URL, hreflang cluster (`en`,`ru`,`ar`), robots index directive, structured data (`Vehicle`/`Offer` where applicable), locale URL consistency, sitemap inclusion, and server-rendered first-response indexable HTML.
11. `NO_SEO` profile is explicit and mandatory: `noindex,nofollow`, sitemap exclusion, no canonical tag, no hreflang tag, no structured data script, and no index-intent metadata.
12. `NON_SEARCHABLE` pages MUST use `NO_SEO` profile.
13. `NON_SEARCHABLE` pages MUST use non-SSR rendering paths. If SSR is technically required for security/session bootstrap, it MUST use `rendering_policy=SSR_EXCEPTION_AWR` and approved AWR; page still MUST remain `NON_SEARCHABLE` with `NO_SEO`.
14. Faceted/filter URLs MUST always be `NON_SEARCHABLE` and canonicalized to the base searchable listing.
15. Default behavior for unclassified routes is deny-index: `NON_SEARCHABLE`, `NO_SEO`, `SSR_FORBIDDEN`, and CI failure until classified.
16. AI-generated or human-authored code MUST follow registry classification; inference outside registry is forbidden.
17. If classification is uncertain, route MUST be treated as `NON_SEARCHABLE` until approved classification update is merged.

## 2. Layering & Module Boundary Rules

### 2.1 Layering (P0)
1. Required flow: `transport -> application -> domain -> infrastructure`.
2. `app/api/**` MUST call application services only.
3. Controllers/route handlers MUST NOT import Prisma or raw SQL clients.
4. Domain policies/invariants MUST reside in domain layer only.
5. Repositories MUST NOT contain business policy.

### 2.2 Bounded Context Ownership (P0)
1. Each table MUST have exactly one owning context in `table_ownership.yaml`.
2. Cross-context direct table writes are forbidden.
3. Cross-context integration MUST use application interfaces or events.
4. Each source file MUST belong to one owning context only.
5. Mixed-context files are forbidden.
6. If feature touches existing aggregate, it MUST extend existing context; parallel context creation is forbidden.

### 2.3 Structure Reuse (P2)
1. Unauthorized top-level source folders are forbidden.
2. Duplicate parallel folder trees for same responsibility are forbidden.
3. Duplicate cross-cutting utility logic is forbidden.
4. Shared utilities MUST be centralized only in paths listed in `docs/architecture/ownership/shared_paths.yaml`.
5. Each bounded context MUST use `src/modules/<context>/{domain,application,infrastructure,transport}`.
6. `domain` MUST NOT import `application`, `transport`, framework, or persistence libraries.
7. `application` MUST orchestrate use-cases, MUST depend on `domain` interfaces, and MUST NOT depend on transport/framework/persistence implementations.
8. `infrastructure` MUST implement adapters/repositories and MUST NOT define business invariants.
9. `transport` MUST adapt protocol concerns and MUST NOT contain decision logic.
10. New folder paths outside declared context scaffolding require approved ADR before merge.

### CI/PR Enforcement
1. ESLint import rules MUST block DB imports in `app/api/**`.
2. Dependency graph checks MUST block forbidden cross-context imports.
3. Ownership manifest checks MUST validate schema-to-context mapping.
4. Duplicate code checks MUST fail when duplicated lines in changed files exceed `3%` or any duplicated block exceeds `30` tokens.
5. Structural lint checks MUST enforce `src/modules/<context>/{domain,application,infrastructure,transport}` path policy.
6. CI MUST fail when domain-layer files import framework or ORM packages.

## 3. Transaction & Isolation Rules

### 3.1 Transaction Boundaries (P0)
1. Every financial mutation command MUST run inside explicit transaction wrapper.
2. Required atomic set (when applicable): business row mutation + ledger write + outbox write.
3. External HTTP/network calls inside open transaction are forbidden.
4. Success response MUST be returned only after transaction commit.

### 3.2 Locking and Isolation (P0)
1. `READ COMMITTED` default for non-financial commands.
2. Financial commands mutating wallet/locks/payments/settlements MUST lock mutated rows (`SELECT ... FOR UPDATE`).
3. Deterministic lock order is mandatory.
4. Bid path MUST use optimistic aggregate version control.
5. Redis lock is advisory only; DB constraints are authoritative.
6. Retry on serialization/deadlock MUST be bounded and idempotent.

### 3.3 Time and SLA Integrity (P1)
1. Financial timestamps MUST use UTC and DB server time.
2. Financial transaction p95 MUST be `<= 2s` in staging gates.

### CI/PR Enforcement
1. Financial command PRs MUST include transaction-boundary tests.
2. Financial command PRs MUST include concurrency and retry tests.
3. CI MUST fail if transaction wrapper is absent on financial command handlers.

## 4. Financial Mutation Rules

### 4.1 Mandatory Financial Command Set (P0)
1. Deposit top-up.
2. Deposit lock acquire.
3. Deposit lock release.
4. Deposit burn.
5. Withdrawal reserve.
6. Withdrawal complete.
7. Withdrawal rollback/reject release.
8. Invoice recognition.
9. Payment receipt posting.
10. Seller payout execution.

### 4.2 Ledger Rules (P0)
1. One business command maps to one immutable ledger transaction identified by unique business source id.
2. Ledger transaction MUST be balanced.
3. Ledger source uniqueness MUST prevent duplicate posting.
4. Manual financial correction MUST use compensating ledger transaction only.
5. Direct mutation of historical ledger rows is forbidden.

### 4.3 Financial Integrity Constraints (P0)
1. Wallet balances MUST remain non-negative.
2. Active deposit lock uniqueness per `(auction_id, company_id)` is mandatory.
3. Financial preconditions MUST use primary DB read inside transaction.
4. Cache/read-model values MUST NOT be financial commit preconditions.
5. Payout requires validated receivable closure and prior required ledger postings.
6. Settlement without payment success is forbidden.
7. The only allowed override for rule 6 is `LEGAL_ORDER_SETTLEMENT`, which MUST require dual approval (`FinanceAdmin` + `ComplianceAdmin`) and mandatory audit plus compensating entries.
8. Withdrawal commands MUST enforce blacklist and compliance hold gates before any fund reservation mutation.

### CI/PR Enforcement
1. DB migration checks MUST verify non-negative wallet constraints and lock uniqueness.
2. Integration tests MUST validate no duplicate payment posting and no double withdrawal.
3. Reconciliation tests MUST assert ledger entries exist for every financial command.

## 5. State Machine Enforcement Rules

### 5.1 Lifecycle Determinism (P1)
1. Every mutable lifecycle aggregate MUST define explicit transition matrix.
2. Direct status assignment is forbidden.
3. Invalid transitions MUST return deterministic domain error and no mutation.
4. Transition history tables MUST be append-only.
5. Transition + required outbox insertion MUST be in same transaction.
6. Replays of same command/preconditions MUST yield same terminal state.

### 5.2 Administrative Overrides (P1)
1. Overrides MUST include reason code.
2. Dual approval is required for transitions into/out of `Canceled`, `Defaulted`, `Settled`, `Relisted`.
3. Override actions MUST be audited immutably.

### CI/PR Enforcement
1. Status field changes without transition matrix updates MUST fail CI.
2. Affected aggregate transition tests are mandatory.

## 6. Idempotency Standards

### 6.1 Command Idempotency (P0)
1. Every mutation endpoint MUST require `Idempotency-Key`.
2. Idempotency record MUST store `(tenant_id, actor_id, endpoint, key, request_hash, response_ref, status, created_at, expires_at)`.
3. Same key + same hash MUST replay prior response (status and body byte-equivalent).
4. Same key + different hash MUST return `409`.
5. Idempotency check MUST run before side effects.

### 6.2 Scope and TTL (P0)
1. Key uniqueness is tenant-scoped.
2. Bid uniqueness MUST include `(auction_id, company_id, key)`.
3. Withdrawal uniqueness MUST include `(company_id, key)`.
4. Webhooks MUST dedupe by provider event id.
5. TTL minimums:
| Command Type | TTL Minimum |
|---|---|
| Financial | 365 days |
| Bid | 90 days |
| Non-financial mutation | 30 days |

### CI/PR Enforcement
1. Mutation endpoint without idempotency middleware MUST fail CI.
2. Replay/duplicate tests are mandatory per new command endpoint.
3. TTL policy tests MUST validate schema and runtime config.

## 7. Outbox & Event Integrity Rules

### 7.1 Outbox Contract (P1)
1. Outbox is mandatory for command-side async side effects.
2. Direct event-bus publish from command transaction is forbidden.
3. Outbox insert MUST be in same transaction as source mutation.

### 7.2 Delivery and Ordering (P1)
1. Delivery semantics are `at-least-once` only.
2. Consumers MUST be idempotent with checkpointing.
3. Ordering guarantee applies only per partition key.
4. Global ordering assumptions are forbidden.

### 7.3 Reliability and SLO (P1)
1. DLQ is mandatory.
2. Outbox lag SLO MUST be defined and monitored.
3. Lag SLO breach MUST trigger incident workflow.

### CI/PR Enforcement
1. Command PRs with side effects MUST include outbox assertions.
2. Consumer PRs MUST include replay-idempotency tests.
3. Event schema changes MUST pass compatibility checks.

## 8. Multi-Tenant & RBAC Rules

### 8.1 Tenant Isolation (P1)
1. Tenant ownership field is required for tenant-scoped tables.
2. Global tables MUST be explicitly declared in ownership manifest.
3. Implicit global scope is forbidden.
4. Repository read/write methods MUST enforce tenant scope.

### 8.2 Authorization (P1)
1. RBAC resolution MUST be tenant-contextual.
2. Region constraints MUST be enforced for region-governed actions.
3. Approval, blacklist, and compliance hold are hard gates.
4. Admin privileges MUST NOT bypass financial hard gates.
5. Cross-tenant admin reads/writes require explicit policy authorization and immutable audit reason.

### CI/PR Enforcement
1. Authorization tests MUST include cross-tenant denial cases.
2. Admin non-bypass tests for bid/deposit gates are mandatory.
3. New table without tenant-scope classification MUST fail CI.

## 9. Compliance & Risk Enforcement Rules

### 9.1 Compliance Hold (P1)
1. Compliance hold MUST synchronously block bid/withdrawal/settlement commands.
2. Hold propagation SLO to all enforcement points: `<= 60s`.
3. During hold transition windows, command default is deny.

### 9.2 Risk and AML (P1)
1. Geo-IP reconciliation MUST run at login and bid submission.
2. Geo mismatch MUST create risk event and score update.
3. Risk thresholds MUST be deterministic and versioned in `risk_thresholds.ts`.
4. AML trigger evaluation MUST run on configured threshold events.
5. Risk model is append-only events + current score snapshot.
6. Manual risk/compliance overrides require reason code and actor attribution.

### CI/PR Enforcement
1. Hold-block integration tests are mandatory for affected commands.
2. Geo mismatch and payment-failure risk event tests are mandatory.
3. Hold race-condition tests are mandatory for affected command paths.

## 10. Schema & Migration Governance Rules

### 10.1 Compatibility and Safety (P1)
1. Expand-contract migration pattern is mandatory.
2. Breaking changes require compatibility window: minimum `2 production releases` and `>= 30 days`, whichever is longer.
3. Destructive migrations on append-only tables are forbidden.
4. Append-only tables MUST enforce DB-level update/delete rejection.
5. Financial and audit history preservation is mandatory.

### 10.2 Backfill and Rollback (P1)
1. Backfills MUST be idempotent and resumable.
2. Production rollback MUST use forward compensating migration.
3. Destructive rollback in production is forbidden.
4. Migration scripts MUST be deterministic and peer-reviewed.

### CI/PR Enforcement
1. CI MUST run forward migration and forward-compensating rollback simulation.
2. CI MUST block drop/rename of required financial/audit columns without compatibility annotation.
3. CI MUST fail append-only semantic changes without architecture approval token.

## 11. Observability & Audit Requirements

### 11.1 Telemetry (P2)
1. Every request MUST carry correlation id.
2. Financial commands MUST include idempotency id in logs and audits.
3. Required metrics: latency, failures, retries, lock contention, queue lag.
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
