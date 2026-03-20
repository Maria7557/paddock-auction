# VIP Early Access Implementation Contract

## 1. Purpose

This document freezes the implementation-level behavior that must not drift during delivery of VIP Early Access.

Source documents:

- [Product.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/Product.md)
- [TECH_PLAN.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/TECH_PLAN.md)
- [TASK_SPLIT.md](/Users/kseniakuncevic/work/paddock-auction/docs/features/vip-byer/TASK_SPLIT.md)

## 2. Controlled Vocabulary

Allowed exact strings:

- canonical business state: `Approved`
- phase label: `VIP Early Access`
- seller/admin active-phase label: `Approved – VIP Early Access`
- regular-buyer teaser text: `Early access for VIP buyers`

Disallowed alternatives:

- `Pre-approved`
- `Approved with note`
- `Approved, public in 24h`

## 3. Actor Mapping

The feature must use the local layered identity model.

Platform auth roles:

- `BUYER`
- `SELLER`
- `ADMIN`
- `SUPER_ADMIN`

Feature actor categories:

- admin
- seller-authenticated owner
- VIP buyer
- regular buyer
- anonymous

Mapping rules:

1. `SUPER_ADMIN` is treated as admin for API authorization, following the current auth mapping.
2. VIP is not a platform auth role; it is derived from `Company.buyerTier === VIP`.
3. Seller access depends on seller auth plus ownership of the listing.
4. Anonymous users are treated as regular buyers unless stricter existing platform rules already block them.

## 4. Data Ownership Contract

Owner for feature timing metadata:

- `Auction`

Do not duplicate the same VIP timing fields across both `Vehicle` and `Auction`.

Required fields:

- `approved_at`
- `vip_access_policy`
- `vip_release_at`
- `approved_by_user_id`
- optional `vip_policy_reason`

## 5. Rollout Fallback Contract

`vip_access_policy` must be explicit and non-ambiguous.

Allowed values:

- `NONE`
- `VIP_EARLY_ACCESS_24H`
- `UNDETERMINED_RESTRICTED`

Required meaning:

- `NONE`: approval succeeded and no VIP Early Access applies
- `VIP_EARLY_ACCESS_24H`: approval succeeded and the 24-hour window applies
- `UNDETERMINED_RESTRICTED`: approval succeeded, rollout applicability could not be determined safely, public access fails closed, and an internal defect signal is emitted

Prohibited behavior:

- blocking approval solely because rollout applicability is temporarily undetermined
- silently defaulting ambiguous cases to public access
- silently defaulting ambiguous cases to VIP-only access without durable verification

## 6. Boundary Contract

The access window uses elapsed-time logic only.

Rules:

- active when `approved_at <= T < vip_release_at`
- inactive when `T >= vip_release_at`
- `vip_release_at = approved_at + 24 hours`

Prohibited logic:

- end of day
- same local time tomorrow
- midnight rollover
- local timezone windowing
- DST-dependent shifting

## 7. Teaser DTO Contract

Regular and anonymous users must never receive a partial version of the full listing DTO.

Allowed teaser shape:

```ts
type VipTeaserCard = {
  teaserKey: string;
  mode: "VIP_TEASER";
  teaserText: "Early access for VIP buyers";
};
```

Forbidden teaser fields:

- image
- seller identity
- make/model/year/title if directly identifying
- VIN or registration identifiers
- price
- countdown
- bid state
- Buy Now data
- watchlist affordance
- detail URL
- raw auction ID
- raw vehicle ID
- vehicle-specific location

## 8. Surface Contracts

### Seller/admin surfaces

- must show `Approved – VIP Early Access` during the active window
- must show `Approved` after release
- must not show countdowns, release times, or manual override controls

### VIP buyer surfaces

- full browse/list card
- visible `VIP Early Access` marker
- full detail page
- VIP-only filter for active inventory
- feature-owned share controls unavailable during active phase

### Regular and anonymous surfaces

- teaser or no result depending on surface
- no direct-discovery search results during active phase
- no detail access during active phase
- no bid, Buy Now, or watchlist access during active phase

## 9. Deployment Safety Contract

Approval-time VIP writes must remain dark until all of the following ship together:

- shared policy enforcement
- search suppression
- action enforcement
- cache isolation
- monitoring

If this condition is not met:

- the feature flag remains OFF
- approval writes must not create active VIP windows

## 10. Architecture Boundary Contract

Required boundaries for implementation:

- Next.js stays UI-only
- Fastify owns business logic and Prisma calls
- frontend fetches backend DTOs through existing API clients
- no direct Prisma usage in Next.js for this feature
- no frontend-only access logic for the 24-hour window

## 11. Definition Of Ready For Code

Implementation may proceed only when:

1. ADR ownership decision exists
2. vocabulary is frozen
3. teaser contract is frozen
4. rollout fallback is frozen
5. deployment safety rule is frozen
