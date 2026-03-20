# ADR: VIP Early Access Ownership On Auctions

## Status

Accepted

## Date

2026-03-19

## Context

The VIP Early Access feature introduces a 24-hour access-control window for newly approved vehicles. The product specification requires:

- the visible business state remains `Approved`
- the access window is derived from an immutable approval timestamp
- regular and anonymous users are restricted during the active window
- the restriction expires automatically at exactly `approval_timestamp + 24 hours`

The current local codebase is not a pure monolith. It has:

- Next.js in `app/` as the presentation layer
- Fastify in `backend/` as the business logic and Prisma owner
- auction-centric approval and buyer access flows

The current approve endpoint in [admin.ts](/Users/kseniakuncevic/work/paddock-auction/backend/src/routes/admin.ts) mutates the latest auction state, and buyer flows are already organized primarily around auctions rather than raw vehicles.

## Decision

VIP Early Access timing metadata will be owned by `Auction`, not `Vehicle`.

The canonical persisted fields for this feature will be added to the `Auction` model:

- `approved_at`
- `vip_access_policy`
- `vip_release_at`
- `approved_by_user_id`
- optional `vip_policy_reason`

## Rationale

This is the best fit for the local codebase because:

1. Approval currently transitions auction behavior, not just vehicle metadata.
2. Buyer browse, detail, and action flows are auction-scoped.
3. Seller/admin status is already derived from the latest auction lifecycle view.
4. Keeping one owner avoids duplicated timing state across `Vehicle` and `Auction`.
5. It keeps read-time policy evaluation close to the existing enforcement surface in Fastify.

## Non-Decision Clarifications

- This does not introduce a new visible business state.
- This does not require the internal auction state enum to become the user-facing seller/admin label.
- This does not move business logic into Next.js.
- This does not make VIP a user role. VIP remains derived from `Company.buyerTier`.

## Role Model Constraints

The local role system is layered and the feature must respect it:

- platform auth roles: `BUYER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`
- buyer tier: `STANDARD`, `VIP`
- company membership roles: `SELLER_MANAGER`, `BUYER_BIDDER`, `OWNER`, `MANAGER`, `MEMBER`

For this feature:

- `SUPER_ADMIN` follows the current auth mapping and is treated as admin for API authorization
- seller access depends on authenticated seller context plus listing ownership
- VIP access depends on buyer role plus `Company.buyerTier === VIP`

## Alternatives Considered

### 1. Store VIP timing on `Vehicle`

Rejected because:

- the current approval path is auction-centric
- it would force auction-facing reads to join or duplicate feature state more often
- it increases the chance of drift between visible inventory and policy timing

### 2. Store VIP timing on both `Vehicle` and `Auction`

Rejected because:

- duplicate ownership creates reconciliation problems
- the feature requires immutability, which becomes harder with duplicated state
- it adds operational complexity without giving better behavior

### 3. Compute rollout eligibility from launch date only at read time

Rejected because:

- non-retroactivity becomes vulnerable to later rollout-rule changes
- the product spec requires deterministic behavior for post-launch approvals
- support/debugging is worse without persisted rollout intent

## Consequences

Positive:

- simpler ownership model
- easier read-time enforcement
- cleaner migration path for backend policy logic
- easier to test exact boundary behavior

Costs:

- schema migration on `Auction`
- admin approval path update
- read surfaces must derive seller/admin wording rather than reuse raw lifecycle state

## Implementation Notes

- The shared VIP access-policy engine should live in a backend-owned location such as `backend/src/lib/` or another backend-owned module path.
- Frontend code should consume backend DTOs only.
- Approval-time writes must remain dark until enforcement, search suppression, and cache isolation are all deployed.
