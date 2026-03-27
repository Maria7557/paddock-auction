# VIP Early Access Technical Plan

## 1. Executive Summary

The right architecture for this feature is not a new service. It is a tightly scoped, policy-heavy change inside the existing split application:

- Next.js remains the presentation layer.
- Fastify remains the single enforcement point for business logic.
- PostgreSQL remains the source of truth for approval timing and access decisions.

The core design choice is to make VIP Early Access a deterministic access policy derived from immutable approval data, not a scheduler-owned state machine. That keeps the system easy to reason about, easy to operate, and correct at the exact `T0 + 24h` boundary.

## 2. Recommended Technology Stack

### 2.1 Application Stack

| Layer | Recommended choice | Why |
| --- | --- | --- |
| Frontend | Next.js 16 App Router + React 19 + TypeScript | Matches the current repo, supports server-rendered UI, and gives us precise cache control for auth-sensitive pages. |
| Backend API | Fastify + TypeScript + Zod | Fast request handling, explicit validation, and a clean place to centralize access-policy logic. |
| Database | PostgreSQL 16 now, PostgreSQL 17 upgrade later as a platform task | PostgreSQL is already the right source of truth for immutable timestamps, indexing, and transactional approval writes. |
| ORM/migrations | Prisma 6 + SQL migrations | Good fit for typed data access and controlled production migrations. |
| Cache | Redis only for invalidation/rate limiting, not as source of truth | Prevents correctness bugs from cache drift. |
| Observability | OpenTelemetry JS + structured logs + audit logs | Needed to prove no role leakage and to debug boundary behavior. |

### 2.2 Standards To Apply

- Use Node.js 24 Active LTS for runtime consistency across environments.
- Render buyer-, seller-, and admin-specific inventory at request time and avoid shared static caching.
- Treat PostgreSQL time as authoritative for approval and release timestamps.
- Keep all access checks server-side; the UI is advisory only.
- Fail closed if role resolution or VIP timing evaluation is incomplete.
- Preserve exact controlled vocabulary from the product spec:
  - canonical business state: `Approved`
  - phase label: `VIP Early Access`
  - seller/admin active-phase label: `Approved – VIP Early Access`
  - regular-buyer teaser text: `Early access for VIP buyers`
- Treat anonymous users as regular buyers unless stricter existing platform rules already block them.
- Use exact elapsed-time logic only:
  - active when `approved_at <= T < vip_release_at`
  - inactive when `T >= vip_release_at`
- Do not use calendar-day, local-midnight, end-of-day, or timezone-window logic.
- Do not introduce any feature-owned override, countdown, exact release timestamp UI, retroactive backfill, or notification flow.

### 2.3 Why This Stack Is The Best Fit

This feature is dominated by consistency and policy reuse, not throughput. The winning design is a modular API monolith with one policy engine, not service fan-out. That minimizes duplicate logic across browse, search, detail, bid, watchlist, and admin/seller status surfaces.

## 3. Architecture Description

### 3.1 Target Architecture

```text
[Browser]
   |
   v
[Next.js 16 UI]
   |
   v
[Fastify API]
   |
   +--> [VIP Access Policy Engine]
   |
   +--> [Approval Service]
   |
   +--> [Listing/Search/Detail/Action Read Services]
   |
   v
[PostgreSQL]

Optional, non-authoritative:
[Redis] for cache invalidation / rate limiting
[Worker] for refresh, reindex, and telemetry fan-out
```

### 3.2 Core Design Principles

1. Approval writes are transactional and idempotent.
2. Access is computed from immutable stored data, not a mutable temporary status.
3. Read-time enforcement is authoritative; background jobs are only an optimization.
4. Every surface uses the same access-policy service.
5. Cache behavior must never allow VIP data to leak into regular-buyer responses.

### 3.3 Data Model Recommendation

Chosen ownership for this feature: `auctions`.

Why `auctions` is the correct owner in the current codebase:

- the current approve path already mutates auction approval/visibility behavior
- buyer browse/detail/action flows are auction-centric
- seller/admin visibility is already attached to the latest auction lifecycle

Do not duplicate the same VIP timing fields onto both `vehicles` and `auctions`. One domain owner is simpler, safer, and easier to keep immutable.

Important semantic rule:

- VIP Early Access is derived access metadata, not a new visible business approval state.
- The user-facing business state remains `Approved`.
- If the current implementation keeps an internal auction lifecycle state such as `SCHEDULED`, that internal state must not leak as a substitute for the required business wording.

Recommended persisted fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `approved_at` | `timestamptz null` | Immutable approval instant set exactly once. |
| `vip_access_policy` | enum/string | `NONE`, `VIP_EARLY_ACCESS_24H`, or `UNDETERMINED_RESTRICTED`; captures rollout applicability at approval time without ambiguity. |
| `vip_release_at` | `timestamptz null` | Immutable `approved_at + interval '24 hours'`; stored for simpler indexing and exact comparisons. |
| `approved_by_user_id` | UUID/string | Auditability. |
| `vip_policy_reason` | text/string nullable | Optional audit/debug note for rollout decision and supportability. |

Recommended indexes:

- `(vip_access_policy, vip_release_at)`
- `(state, vip_release_at)`
- A partial index for active VIP inventory if the team is comfortable using Prisma partial-index support or raw SQL migration

Important rule:

- Do not infer rollout eligibility later from a moving launch date constant alone.
- Capture whether the feature applied at approval time and store it durably.
- If rollout applicability is unknown at approval time, persist that fact explicitly rather than silently treating it as public or VIP.

That design makes non-retroactivity deterministic and protects the system from future rollout-rule drift.

### 3.4 Approval Write Path

The admin approval endpoint should become the only place that creates VIP Early Access timing.

Write flow:

1. Validate the vehicle is approvable.
2. Open a DB transaction.
3. Read authoritative DB time.
4. If already approved, return the existing approval metadata without changing it.
5. Persist approved business state.
6. Persist `approved_at`.
7. Resolve rollout applicability:
   - `VIP_EARLY_ACCESS_24H` if the feature applies
   - `NONE` if the feature does not apply
   - `UNDETERMINED_RESTRICTED` if approval must succeed but rollout applicability cannot be safely determined
8. Persist `vip_release_at = approved_at + 24h` for `VIP_EARLY_ACCESS_24H` and `UNDETERMINED_RESTRICTED`.
9. Write state transition and audit log.
10. Commit.

Implementation detail that matters:

- Use PostgreSQL as the time authority inside the transaction. Do not trust app-server wall clocks for the approval instant.
- The feature flag must remain OFF for live approval writes until the enforcement, search, and cache layers are deployed together.
- Admins must not be given any feature-owned control to choose applicability, shorten the window, extend it, skip it, or manually release inventory.

### 3.5 Shared Access-Policy Engine

Create one backend module, for example `src/modules/vehicles/application/vip_access_policy.ts`, that evaluates:

- actor type: admin, seller, VIP buyer, regular buyer, anonymous
- current buyer VIP status
- seller/admin ownership relationship
- approval state
- `approved_at`
- `vip_access_policy`
- `vip_release_at`
- current timestamp
- request context: browse, search, detail, bid, buy now, watchlist, share

Output a single policy result object, for example:

```ts
type VipAccessDecision = {
  vipEarlyAccessActive: boolean;
  listingMode: "FULL" | "TEASER" | "HIDDEN";
  detailAllowed: boolean;
  bidAllowed: boolean;
  buyNowAllowed: boolean;
  watchlistAllowed: boolean;
  shareAllowed: boolean;
  searchable: boolean;
  sellerAdminStatusLabel: "Approved" | "Approved – VIP Early Access";
  buyerBadge: "VIP Early Access" | null;
  teaserText: "Early access for VIP buyers" | null;
};
```

This module should be the only place where the 24-hour rule lives.

Required policy semantics:

- `vipEarlyAccessActive = true` iff:
  - listing business approval is active
  - `vip_access_policy === "VIP_EARLY_ACCESS_24H"`
  - `approved_at <= now < vip_release_at`
- `vipEarlyAccessActive = false` iff:
  - `now >= vip_release_at`, or
  - `vip_access_policy === "NONE"`, or
  - the listing is not approved
- `vip_access_policy === "UNDETERMINED_RESTRICTED"` means:
  - approval remains successful
  - seller/admin surfaces still work
  - regular and anonymous discovery/detail/actions fail closed
  - VIP-only access may be granted only when role and timing can be verified from durable data
  - the system emits an internal defect signal and alert

This module must also own:

- exact seller/admin labels
- exact teaser text
- anonymous-user treatment
- exact boundary behavior at `T0 + 24h`
- “no override” behavior

### 3.6 API and Read Model Changes

#### Seller/admin surfaces

- Seller/admin status text must be derived, never manually edited.
- During the active phase the exact text is `Approved – VIP Early Access`.
- After release the exact text is `Approved`.
- Seller/admin surfaces must not show:
  - countdown
  - exact public release time
  - override controls
  - alternative wording such as `Pre-approved` or `Approved, public in 24h`

#### VIP buyer browse/list endpoints

- VIP buyers receive full cards plus exactly one clear `VIP Early Access` marker.
- The marker must be visible on the primary discovery surface and not hidden behind hover/click only.
- VIP buyers must never receive teaser content in place of the full card.

#### VIP buyer detail endpoints

- VIP buyers receive the normal full detail payload.
- Countdown, price, and normal buyer actions remain visible subject to unrelated platform rules.
- VIP detail responses must not be downgraded because of this feature.

#### VIP buyer filter endpoints

- Expose a VIP-only filter labeled clearly for `VIP Early Access` inventory.
- The filter is visible only to VIP buyers.
- The filter returns active-phase vehicles only.
- The filter excludes expired, non-approved, or otherwise unavailable inventory.

#### VIP buyer share behavior

- During the active phase, feature-owned share controls must be hidden, disabled, or server-rejected.
- No product-supported share URL generation may remain usable during the active phase.
- Browser address-bar copy is out of scope and must be handled by detail-access enforcement.

#### Regular/anonymous browse/list endpoints

- Regular and anonymous users receive either a teaser card or no listing, depending on the surface.
- Teasers must rank below accessible full listings in mixed result sets.
- Teasers must be non-navigable.

Recommended teaser DTO contract:

```ts
type VipTeaserCard = {
  teaserKey: string;
  mode: "VIP_TEASER";
  teaserText: "Early access for VIP buyers";
};
```

The teaser DTO must not expose:

- vehicle image
- seller identity
- make/model/year/title that enables direct discovery
- VIN or registration identifiers
- price, countdown, bid state, Buy Now data
- location if vehicle-specific
- detail URL, auction ID, vehicle ID, or watchlist entry points

#### Search endpoints

- Regular and anonymous users must never get direct-discovery results for active VIP inventory.
- Even if search indexing lags, the serving layer must filter before returning results.
- Autocomplete and search suggestions must follow the same suppression rule.

#### Detail endpoints

- Regular and anonymous users must be rejected before any full-detail payload is built.
- VIP buyers and authorized sellers/admins receive normal detail data.

#### Action endpoints

- `bid`
- `buy now`
- `watchlist`

Each endpoint must call the shared policy engine and reject regular buyers during the active window even if the UI is stale.

Required behavior:

- UI suppression alone is insufficient.
- Direct endpoint calls must be rejected for regular and anonymous users.
- Rejection payloads must not leak restricted detail data.

### 3.7 Frontend Architecture

Frontend changes should be thin and DTO-driven.

Rules:

- Next.js stays UI-only; no direct Prisma access for this feature.
- Buyer, seller, and admin pages that depend on actor-specific visibility should use request-time rendering and/or `cache: "no-store"` for authenticated data fetches.
- The frontend should render the exact backend-provided mode: full card, teaser, blocked detail, VIP badge, status label.
- Do not recompute the 24-hour window independently in the browser.
- All feature-owned share controls must bind to backend policy output, not ad hoc local state.

Frontend feature areas:

- buyer browse/list card
- buyer detail page access state
- buyer VIP filter
- buyer share control suppression
- seller status chips
- admin status chips

### 3.8 Caching and Search Safety

This is the highest-risk operational area.

Required rules:

- Do not cache personalized listing/detail responses in a way that is shared across VIP and regular buyers.
- Avoid shared static generation for routes that show actor-specific inventory.
- For Next.js fetches serving authenticated inventory, use dynamic rendering or explicit no-store semantics.
- Partition any backend cache key by actor bucket at minimum:
  - admin
  - seller-owner
  - VIP buyer
  - regular buyer
  - anonymous/public
- Search/autocomplete must be filtered in the serving layer, even if the index is stale.
- Cache invalidation is an optimization only; stale cache must never be authoritative over policy evaluation.

Recommended initial posture:

- Start with no shared caching on buyer inventory and detail pages.
- Add selective caching only after boundary and leakage tests are green.

### 3.9 Automatic Release Strategy

Do not make a cron job responsible for correctness.

Correct design:

- The feature expires automatically because every read compares `now >= vip_release_at`.
- Optional jobs may invalidate cache, refresh materialized views, or trigger search reindex after release.
- If a worker is delayed, user-visible behavior still remains correct.
- Boundary handling is exact:
  - `T0 + 24h - 1ms` remains restricted
  - `T0 + 24h` becomes public
- DST, timezone conversion, and date-boundary changes must not affect release timing.

### 3.10 Security and Compliance Guardrails

- Fail closed to regular-buyer restrictions if buyer role or company tier cannot be resolved.
- Never trust hidden buttons as enforcement.
- Audit every approve action and every denied restricted action class.
- Add structured logs for policy decisions at debug level in non-production and sampled production traces.
- If approval metadata is missing for an apparently feature-eligible approved listing, fail closed for public access and raise an internal defect.
- Do not allow any admin API or UI control to shorten, extend, skip, or manually end the phase.

### 3.11 Defect Classification

Blocking launch defects:

- regular or anonymous users can open detail pages during the active phase
- regular or anonymous users can bid, Buy Now, or watchlist during the active phase
- regular or anonymous users can directly discover active VIP inventory through search or autocomplete
- teaser responses expose forbidden data
- seller/admin wording differs from the controlled vocabulary
- any override or manual release control exists
- the phase does not last exactly 24 elapsed hours
- pre-launch approvals are retroactively included
- teaser ranking appears equal to or above accessible listings in mixed sets

Warning-only defects:

- VIP badge styling is imperfect but text remains clear
- a stale teaser briefly persists client-side after phase end, provided refetch returns the correct server response
- share control visual styling differs, provided it remains unusable

### 3.12 Observability

Add the following telemetry:

- `vip_approval_created_total`
- `vip_early_access_active_count`
- `vip_regular_buyer_detail_denied_total`
- `vip_regular_buyer_action_denied_total`
- `vip_search_suppressed_total`
- `vip_teaser_rendered_total`
- `vip_boundary_transition_latency_seconds`
- `vip_policy_undetermined_total`
- `vip_anonymous_access_denied_total`

Dashboards should break down denials by endpoint and buyer tier so leakage is obvious during rollout.

### 3.13 Deployment Safety Rule

This feature must not be deployed as independently active slices.

Safe rollout sequence:

1. ship additive schema changes
2. ship dormant policy engine and dormant UI rendering
3. ship search suppression and cache partitioning
4. ship tests and monitoring
5. only then enable the approval-time feature flag that writes active VIP windows

Hard rule:

- approval-path activation and public enforcement must be enabled in the same release train
- if that is not possible, approval writes remain dark and `vip_access_policy` must stay `NONE`

## 4. Implementation Phases

### Phase 0: ADR and contract definition

Deliverables:

- ADR for data ownership and policy engine location
- chosen schema owner: `auctions`
- DTO contracts for full card, teaser card, detail denied state, status labels
- rollout flag definition
- controlled vocabulary contract
- anonymous-user handling contract
- explicit “out of scope” contract to block countdowns, overrides, notifications, and backfill

Exit criteria:

- one approved source of truth for VIP policy evaluation
- no ambiguity about exact strings or boundary behavior
- teaser allowlist and forbidden fields approved in writing

### Phase 1: Persistence and approval path

Deliverables:

- Prisma schema changes and SQL migration
- transactional approval write path
- immutable `approved_at` and `vip_release_at`
- explicit `UNDETERMINED_RESTRICTED` fallback handling
- duplicate-approval defense
- audit log updates
- dark-launch gating for approval writes

Exit criteria:

- approval writes are atomic
- second approval call does not reset the 24-hour window
- pre-launch approvals remain unaffected
- approval can succeed safely even when rollout applicability is temporarily undetermined

### Phase 2: Shared policy engine and backend enforcement

Deliverables:

- central VIP policy service
- integration into browse, search, autocomplete, detail, bid, buy now, watchlist, seller, and admin endpoints
- seller/admin label derivation from same policy engine
- fail-closed behavior for incomplete context
- anonymous-as-regular behavior
- direct URL denial behavior

Exit criteria:

- every protected path uses the same evaluator
- regular buyers cannot bypass restrictions through direct endpoints
- anonymous users cannot bypass restrictions through public routes

### Phase 3: Frontend UX integration

Deliverables:

- VIP badge on full cards for VIP buyers
- teaser cards for regular buyers
- blocked detail state for regular buyers
- VIP filter for VIP buyers only
- share control hidden/disabled during active phase
- seller/admin exact status strings
- no countdown or release-time UI
- no teaser click-through targets

Exit criteria:

- UI matches the deterministic spec exactly
- browser-only state cannot create an authorization bypass
- share controls are unusable for active VIP inventory

### Phase 4: Search, caching, and ranking hardening

Deliverables:

- search suppression in serving layer
- teaser ranking rules
- no-store or actor-segmented cache behavior
- cache invalidation hooks for approval and release
- autocomplete suppression
- public/anonymous cache bucket hardening

Exit criteria:

- no cross-tier response leakage in tests
- teaser cards never outrank accessible listings in mixed sets
- stale search index contents cannot leak active VIP inventory to regular or anonymous users

### Phase 5: Verification, rollout, and monitoring

Deliverables:

- unit tests for policy boundaries
- integration tests for approval, browse, search, detail, and actions
- E2E tests for VIP buyer and regular buyer journeys
- canary rollout flag
- dashboards and alerts
- anonymous-user journey coverage
- PRD requirement traceability sign-off

Exit criteria:

- exact `T0 + 24h` boundary behavior proven
- no manual release step anywhere in UI or API
- monitoring in place before 100% rollout
- every PRD section is mapped to implementation and test coverage

## 5. Testing Strategy

### 5.1 Unit tests

- policy evaluation across actor types
- exact boundary: `T0 + 24h - 1ms` vs `T0 + 24h`
- duplicate approval calls
- VIP tier change during active window
- rollout-undetermined fallback
- anonymous treated as regular
- no calendar-day or DST-dependent logic
- exact seller/admin labels and teaser text

### 5.2 Integration tests

- admin approve endpoint writes immutable timestamps
- regular buyer search suppression despite stale search data
- regular buyer detail blocked by direct URL
- regular buyer action endpoints reject even with stale frontend state
- seller/admin status changes automatically after the window
- VIP filter membership enters immediately and leaves exactly at release
- share endpoint/control disabled during active phase
- missing approval metadata fails closed
- anonymous browse/search/detail requests behave as regular-restricted traffic

### 5.3 E2E tests

- VIP buyer sees full card and detail
- regular buyer sees teaser or no result, depending on surface
- post-window release happens without manual action
- seller and admin see exact status wording during and after phase
- regular teaser contains no forbidden fields and no click target
- VIP share control is unavailable during active phase

### 5.4 Non-functional tests

- cache-leak tests between VIP and regular sessions
- clock-skew tests using DB-authoritative time
- load test on mixed browse/search traffic at release boundaries
- anonymous/public cache isolation tests
- stale autocomplete/index suppression tests

### 5.5 PRD Coverage Matrix

| Product spec section | Tech plan coverage | Implementation phase | Test coverage |
| --- | --- | --- | --- |
| 2. Controlled vocabulary | Sections 2.2, 3.5, 3.6 | Phase 0, Phase 3 | 5.1, 5.3 |
| 3. Actors | Sections 2.2, 3.5, 3.8 | Phase 0, Phase 2 | 5.1, 5.2, 5.3 |
| 4. Inputs and derived inputs | Sections 3.4, 3.5, 3.9 | Phase 1, Phase 2 | 5.1, 5.2 |
| 5. Persisted data behavior | Sections 3.3, 3.4 | Phase 1 | 5.2 |
| 6. Approval event | Sections 3.4, 3.10, 3.13 | Phase 1, Phase 5 | 5.1, 5.2 |
| 7. VIP Early Access time window | Sections 2.2, 3.5, 3.9 | Phase 2 | 5.1, 5.4 |
| 8. Seller-facing status behavior | Sections 3.5, 3.6 | Phase 2, Phase 3 | 5.1, 5.3 |
| 9. Admin-facing status behavior | Sections 3.5, 3.6, 3.10 | Phase 2, Phase 3 | 5.1, 5.3 |
| 10. VIP buyer browse/list | Sections 3.5, 3.6, 3.7 | Phase 2, Phase 3 | 5.2, 5.3 |
| 11. VIP buyer detail | Sections 3.5, 3.6 | Phase 2, Phase 3 | 5.2, 5.3 |
| 12. VIP buyer filter | Sections 3.6, 3.7 | Phase 2, Phase 3 | 5.2, 5.3 |
| 13. VIP share behavior | Sections 3.6, 3.7 | Phase 2, Phase 3 | 5.2, 5.3 |
| 14. Regular buyer browse/list teaser | Sections 3.5, 3.6, 3.8 | Phase 2, Phase 3, Phase 4 | 5.2, 5.3 |
| 15. Regular buyer search suppression | Sections 3.6, 3.8 | Phase 2, Phase 4 | 5.2, 5.4 |
| 16. Regular buyer detail blocking | Sections 3.5, 3.6, 3.10 | Phase 2 | 5.2, 5.3 |
| 17. Regular buyer action blocking | Sections 3.5, 3.6, 3.10 | Phase 2 | 5.2 |
| 18. Post-phase automatic release | Sections 3.5, 3.8, 3.9 | Phase 2, Phase 4 | 5.1, 5.2, 5.3 |
| 19. Access-control matrix | Sections 3.5, 3.6 | Phase 2 | 5.1, 5.2, 5.3 |
| 20. Validation and error-state rules | Sections 3.4, 3.5, 3.10, 3.11 | Phase 1, Phase 2 | 5.1, 5.2 |
| 21. Propagation rules | Sections 3.4, 3.5, 3.8, 3.9 | Phase 1, Phase 2, Phase 4 | 5.2, 5.4 |
| 22. Top edge cases | Sections 3.4, 3.5, 3.8, 3.9, 3.11, 3.13 | Phase 1-5 | 5.1, 5.2, 5.4 |
| 23. Deterministic acceptance suite | Sections 4, 5 | Phase 5 | 5.1-5.4 |
| 24. Out-of-scope enforcement | Sections 2.2, 3.6, 4, 6 | Phase 0, Phase 5 | design review + regression tests |

## 6. Delivery Recommendation

Build this as a backend-first feature with thin UI integration:

1. ship schema and approval path first
2. ship centralized policy evaluation second
3. attach all read and action endpoints to that policy
4. add frontend rendering last
5. launch behind a feature flag

That sequence minimizes the chance of shipping inconsistent rules across surfaces.

## 7. Final Recommendation

Keep the current platform direction:

- Next.js for presentation
- Fastify as the policy and transaction boundary
- PostgreSQL as the time and truth authority
- Redis and workers as optional accelerators, never correctness dependencies

For this feature, the highest-value engineering investment is a single reusable access-policy engine plus strict cache discipline. That gives the team a design that is simple, scalable, and easy to support as more buyer-tier and timed-access features are added later.

## 8. Reference Notes

As of March 19, 2026:

- Node.js lists v24 as Active LTS and recommends production use of Active LTS or Maintenance LTS releases.
- Next.js App Router docs show version 16.2.0, with the Route Segment Config page updated on March 13, 2026 and the `fetch` page updated on March 3, 2026.
- Prisma documents transactional writes via `$transaction(...)` and production schema rollout via `prisma migrate deploy`.
- OpenTelemetry JS remains the standard path for Node.js and browser telemetry instrumentation.

Sources:

- [Node.js release policy](https://nodejs.org/en/about/previous-releases)
- [Next.js route segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [Next.js fetch caching](https://nextjs.org/docs/app/api-reference/functions/fetch)
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma migrate deploy](https://www.prisma.io/docs/cli/migrate/deploy)
- [OpenTelemetry JavaScript docs](https://opentelemetry.io/docs/languages/js/)
