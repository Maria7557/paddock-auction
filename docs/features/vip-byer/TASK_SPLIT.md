# VIP Early Access Task Split

## 1. Goal

Translate the VIP Early Access feature into implementation-ready work so the team can ship it safely, without violating the product spec in [Product.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/Product.md) or the architecture in [TECH_PLAN.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/TECH_PLAN.md).

## 2. Delivery Rules

Hard rules for execution:

1. Do not activate approval-time VIP writes before backend enforcement, search suppression, and cache isolation are deployed.
2. Keep one source of truth for policy evaluation.
3. Treat anonymous users as regular buyers unless stricter existing platform rules apply.
4. Do not reuse full listing DTOs for teaser responses.
5. Preserve exact controlled vocabulary:
   - `Approved`
   - `Approved – VIP Early Access`
   - `VIP Early Access`
   - `Early access for VIP buyers`

## 3. Local Role And Architecture Snapshot

### 3.1 Local role model

The local codebase uses layered identity, not one flat role enum.

Platform user roles from Prisma:

- `BUYER`
- `SELLER`
- `ADMIN`
- `SUPER_ADMIN`

Important local behavior:

- JWT role mapping currently collapses `SUPER_ADMIN` into `ADMIN` for API authorization.
- VIP is not a user role. VIP is derived from `Company.buyerTier`:
  - `STANDARD`
  - `VIP`
- Company membership roles are separate from platform roles:
  - `SELLER_MANAGER`
  - `BUYER_BIDDER`
  - `OWNER`
  - `MANAGER`
  - `MEMBER`

Feature implementation must therefore evaluate:

- platform auth role
- company linkage
- buyer tier
- listing ownership

and must not treat “VIP” or “seller-owner” as standalone persisted auth roles.

### 3.2 Local architecture model

The local repo enforces these boundaries:

- `app/` is presentation/UI
- `src/` is infrastructure/shared logic
- Fastify in `backend/` owns API behavior, business logic, and Prisma transactions
- frontend data access goes through `src/lib/api-client.ts`

For this feature:

- do not put VIP business logic in Next.js pages/components
- do not add direct Prisma usage to the frontend
- prefer backend-owned implementation homes under `backend/src/lib/` or another backend-owned module path
- frontend work should consume backend DTOs only

## 4. Workstreams

### WS1. Contracts and ADR

Purpose:

- Freeze behavior before code changes begin.

Tasks:

- `VIP-001` Write ADR confirming `auctions` as the owner of VIP timing metadata.
- `VIP-002` Freeze controlled vocabulary and prohibited wording.
- `VIP-003` Freeze teaser DTO allowlist and forbidden fields.
- `VIP-004` Freeze anonymous-user behavior contract.
- `VIP-005` Freeze rollout safety rule: feature flag remains dark until enforcement ships.

Deliverables:

- ADR merged
- implementation contract merged
- vocabulary and non-goal list

Dependencies:

- none

Likely files:

- [TECH_PLAN.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/TECH_PLAN.md)
- [ADR-2026-03-19-vip-early-access-auction-ownership.md](/Users/kseniakuncevic/work/paddock-auction/docs/architecture/ADR-2026-03-19-vip-early-access-auction-ownership.md)
- [IMPLEMENTATION_CONTRACT.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/IMPLEMENTATION_CONTRACT.md)

### WS2. Data Model and Approval Path

Purpose:

- Persist immutable approval metadata safely and atomically.

Tasks:

- `VIP-010` Add Prisma schema fields on `Auction`:
  - `approved_at`
  - `vip_access_policy`
  - `vip_release_at`
  - `approved_by_user_id`
  - optional `vip_policy_reason`
- `VIP-011` Create SQL migration and indexes.
- `VIP-012` Update admin vehicle approval transaction to persist immutable timestamps.
- `VIP-013` Add tri-state rollout fallback:
  - `NONE`
  - `VIP_EARLY_ACCESS_24H`
  - `UNDETERMINED_RESTRICTED`
- `VIP-014` Add duplicate-approval defense so re-approval does not reset the window.
- `VIP-015` Add audit logging for approval metadata creation.
- `VIP-016` Keep approval writes dark behind a feature flag until launch gate passes.

Deliverables:

- schema and migration
- backend approval write path
- audit coverage

Dependencies:

- WS1

Likely files:

- [schema.prisma](/Users/kseniakuncevic/work/paddock-auction/prisma/schema.prisma)
- [admin.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/admin.ts)

### WS3. Shared Policy Engine

Purpose:

- Centralize all VIP Early Access decisions in one backend module.

Tasks:

- `VIP-020` Create `vip_access_policy` module in the backend domain/application layer.
- `VIP-021` Model actor categories using local role mapping:
  - admin
  - seller-authenticated
  - VIP buyer
  - regular buyer
  - anonymous
- `VIP-021a` Document actor derivation:
  - `ADMIN` and `SUPER_ADMIN` JWT users map to admin surfaces
  - seller access is based on authenticated seller context plus listing ownership
  - VIP buyer vs regular buyer comes from `Company.buyerTier`
  - company membership roles must not be confused with feature actor categories
- `VIP-022` Implement exact boundary logic:
  - active at `approved_at <= T < vip_release_at`
  - inactive at `T >= vip_release_at`
- `VIP-023` Implement `UNDETERMINED_RESTRICTED` fail-closed behavior.
- `VIP-024` Return derived outputs:
  - listing mode
  - detail access
  - bid/buy now/watchlist access
  - searchability
  - share access
  - seller/admin status text
  - VIP badge
  - teaser text
- `VIP-025` Ensure the module never exposes a manual override path.

Deliverables:

- shared evaluator with tests

Dependencies:

- WS1
- WS2

Likely files:

- new module under `backend/src/lib/` or another backend-owned module path
- [auth.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/lib/auth.ts) for actor context enrichment

### WS4. Seller/Admin Surfaces

Purpose:

- Ensure internal users see the correct derived status with no extra controls.

Tasks:

- `VIP-030` Update admin listing/detail surfaces to show `Approved – VIP Early Access` during active window and `Approved` after release.
- `VIP-031` Update seller-facing surfaces with the same exact wording.
- `VIP-032` Remove or block any possibility of countdown, exact release time, or override controls in feature-owned UI.
- `VIP-033` Ensure internal lifecycle state such as `SCHEDULED` does not leak as a substitute for the required wording.

Deliverables:

- seller/admin status rendering

Dependencies:

- WS3

Likely files:

- [admin.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/admin.ts)
- [VehiclesTable.tsx](/Users/kseniakuncevic/work/paddock-auction/app/admin/vehicles/VehiclesTable.tsx)
- seller-facing routes/components where status is rendered

### WS5. VIP Buyer Experience

Purpose:

- Deliver the positive-path experience for VIP buyers.

Tasks:

- `VIP-040` Return full browse/list cards for VIP buyers.
- `VIP-041` Add exactly one clear `VIP Early Access` marker.
- `VIP-042` Return full detail payloads for VIP buyers during the active window.
- `VIP-043` Add VIP-only filter for active VIP Early Access inventory.
- `VIP-044` Disable/hide feature-owned share controls during active phase.

Deliverables:

- VIP browse
- VIP detail
- VIP filter
- VIP share suppression

Dependencies:

- WS3

Likely files:

- [index.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/buyer/index.ts)
- buyer UI components under `app/` and `components/`

### WS6. Regular and Anonymous Restrictions

Purpose:

- Deliver the protected-path behavior for non-VIP traffic.

Tasks:

- `VIP-050` Introduce a dedicated teaser DTO, not a partial full-card DTO.
- `VIP-051` Ensure teaser contains only:
  - opaque key
  - mode
  - exact teaser text
- `VIP-052` Ensure teaser never contains:
  - image
  - seller identity
  - price
  - location if vehicle-specific
  - make/model/title if directly identifying
  - VIN
  - detail URL
  - watchlist or bid affordances
- `VIP-053` Block direct detail page access for regular buyers.
- `VIP-054` Apply the same restrictions to anonymous/public traffic.
- `VIP-055` Ensure teaser cards cannot navigate to detail pages.

Deliverables:

- safe teaser contract
- detail blocking
- anonymous parity

Dependencies:

- WS3

Likely files:

- [index.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/buyer/index.ts)
- public marketplace components

### WS7. Search, Autocomplete, Ranking

Purpose:

- Prevent discoverability leaks outside the main listing flow.

Tasks:

- `VIP-060` Suppress active VIP inventory from regular-buyer search responses.
- `VIP-061` Suppress active VIP inventory from anonymous/public search responses.
- `VIP-062` Suppress autocomplete/suggestion leakage.
- `VIP-063` Enforce serving-layer suppression even if search indexes lag.
- `VIP-064` Rank teaser cards below accessible listings in mixed result sets.

Deliverables:

- search suppression
- ranking safety

Dependencies:

- WS3
- WS6

### WS8. Action Enforcement

Purpose:

- Block direct mutations from regular and anonymous users.

Tasks:

- `VIP-070` Gate bid endpoint with shared VIP policy.
- `VIP-071` Gate Buy Now endpoint with shared VIP policy.
- `VIP-072` Gate watchlist endpoint with shared VIP policy.
- `VIP-073` Ensure rejection payloads do not leak restricted detail data.
- `VIP-074` Re-evaluate access on every request so role changes take effect immediately.

Deliverables:

- server-side action enforcement

Dependencies:

- WS3

Likely files:

- [bids.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/bids.ts)
- watchlist-related handlers in [index.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/buyer/index.ts)

### WS9. Cache and Deployment Safety

Purpose:

- Avoid the hardest-to-debug production failures: cross-tier leaks and unsafe rollout.

Tasks:

- `VIP-080` Audit buyer/public pages for shared static caching.
- `VIP-081` Ensure authenticated inventory fetches use request-time rendering or `cache: "no-store"`.
- `VIP-082` Partition backend cache keys by actor bucket:
  - admin
  - seller-authenticated-owner
  - VIP buyer
  - regular buyer
  - anonymous
- `VIP-083` Add cache invalidation hooks on approval and release as optimization only.
- `VIP-084` Add launch checklist item: do not enable approval-time writes until WS3, WS6, WS7, and WS8 are deployed.

Deliverables:

- cache policy
- rollout safety checklist

Dependencies:

- WS3
- WS6
- WS7
- WS8

### WS10. Observability and Alerts

Purpose:

- Make leaks and rollout problems visible immediately.

Tasks:

- `VIP-090` Emit approval creation metric.
- `VIP-091` Emit denials for detail/actions/search suppression.
- `VIP-092` Emit anonymous-denial metric.
- `VIP-093` Emit `UNDETERMINED_RESTRICTED` metric and alert.
- `VIP-094` Add dashboard by actor bucket and endpoint.
- `VIP-095` Add audit events for restricted access defects if detected.

Deliverables:

- metrics
- dashboard
- alerting

Dependencies:

- WS2
- WS3

### WS11. Verification and Launch

Purpose:

- Prove the implementation matches the spec before enabling the feature.

Tasks:

- `VIP-100` Unit tests for policy semantics and boundary exactness.
- `VIP-101` Integration tests for approval writes and immutable timestamps.
- `VIP-102` Integration tests for regular and anonymous search/detail/action blocking.
- `VIP-103` Integration tests for VIP filter entry/exit timing.
- `VIP-104` E2E tests for VIP buyer flows.
- `VIP-105` E2E tests for regular buyer teaser behavior.
- `VIP-106` E2E tests for anonymous/public behavior.
- `VIP-107` Non-functional tests for cache leakage and stale search indexes.
- `VIP-108` Trace every Product spec section to implementation and tests.
- `VIP-109` Run launch readiness review and enable the feature flag.

Deliverables:

- green test suite
- PRD traceability sign-off
- launch checklist

Dependencies:

- WS2 through WS10

## 5. Critical Path

Critical path tasks:

1. `VIP-001` through `VIP-005`
2. `VIP-010` through `VIP-016`
3. `VIP-020` through `VIP-025`
4. `VIP-050` through `VIP-055`
5. `VIP-060` through `VIP-064`
6. `VIP-070` through `VIP-074`
7. `VIP-080` through `VIP-084`
8. `VIP-100` through `VIP-109`

These tasks must be complete before the feature flag is turned on.

## 6. Parallelization Plan

Can run in parallel after WS1:

- WS2 Data Model and Approval Path
- WS3 Shared Policy Engine skeleton

Can run in parallel after WS3:

- WS4 Seller/Admin Surfaces
- WS5 VIP Buyer Experience
- WS6 Regular and Anonymous Restrictions
- WS8 Action Enforcement
- WS10 Observability

Can run in parallel after WS6 and WS3:

- WS7 Search, Autocomplete, Ranking

Runs near the end:

- WS9 Cache and Deployment Safety
- WS11 Verification and Launch

## 7. Review Findings Mapping

### Finding 1: Anonymous-path coverage missing

Covered by:

- `VIP-004`
- `VIP-021`
- `VIP-054`
- `VIP-061`
- `VIP-082`
- `VIP-092`
- `VIP-102`
- `VIP-106`

### Finding 2: Rollout lookup fallback missing

Covered by:

- `VIP-013`
- `VIP-023`
- `VIP-093`
- `VIP-101`

### Finding 3: Unsafe partial deployment

Covered by:

- `VIP-005`
- `VIP-016`
- `VIP-084`
- `VIP-109`

### Finding 4: Teaser contract too loose

Covered by:

- `VIP-003`
- `VIP-050`
- `VIP-051`
- `VIP-052`
- `VIP-105`

## 8. Definition of Done

The feature is done only when all of the following are true:

1. Approval writes are atomic and immutable.
2. A single policy engine drives browse, search, detail, actions, seller/admin status, and share behavior.
3. Regular and anonymous users cannot discover or access restricted inventory during the active window.
4. VIP users get the intended full-access experience during the active window.
5. Seller/admin wording matches the spec exactly.
6. No manual release or override path exists.
7. Exact `T0 + 24h` boundary behavior is proven in tests.
8. Cache, search, and autocomplete do not leak across actor buckets.
9. Review findings are closed.
10. Feature flag is enabled only after launch review.
