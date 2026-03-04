# Frontend Final Report (PRD v2.0 Invariant Validation)

Date: 2026-03-02
Validation type: Financial and invariant validation (non-visual)
PRD source: `/Users/Caro/Documents/paddock-auction/PRD_v2.0.md`

## PASS/FAIL Matrix

| Invariant to Validate | PRD Reference | UI Evidence | Verdict | Notes |
|---|---|---|---|---|
| `NO DEPOSIT = NO BID` | INV-01 (`PRD_v2.0.md:14`) | Bid desk explicitly states policy and maps `NO_DEPOSIT_NO_BID` API rejection. See `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/bid_ticket.tsx:67`, `:235`. | CONDITIONAL PASS | UI surfaces and handles rejection, but does not pre-validate deposit availability before POST. Effective enforcement remains backend-driven. |
| Approval + blacklist bid gates | INV-02, INV-03 (`PRD_v2.0.md:15-16`) | Bid form requests “Approved company/user ID”. See `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/bid_ticket.tsx:241`, `:251`. No dedicated blacklist/approval status check or explicit blacklist UX in UI. | CONDITIONAL PASS | Treated as backend contract enforcement only; UI does not actively gate or clearly surface blacklist state. |
| Idempotency key generation and safe reuse | INV-08 (`PRD_v2.0.md:21`), DATA-INV-02 | Bid and payment flows auto-generate keys, send `Idempotency-Key`, keep key for retry/replay semantics, and provide copy/regenerate controls. See `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/bid_ticket.tsx:34`, `:184`, `:302`; `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/finance_table.tsx:30`, `:154`, `:196`. | PASS | Frontend behavior aligns with deterministic retry guidance. |
| Auction state machine rendering | INV-09 (`PRD_v2.0.md:22`, `:83-109`) | UI shows state chips and lifecycle section; bidding form shown only when `status === "LIVE"`. See `/Users/Caro/Documents/paddock-auction/app/auctions/[auctionId]/page.tsx:49`, `:107-124`, `:139-156`; `/Users/Caro/Documents/paddock-auction/src/modules/ui/domain/mvp_read_model_stub.ts:4-10`. | CONDITIONAL PASS | Rendering is partial vs formal PRD machine (subset of states; no transition graph/guard reason surface). Mutation validity remains backend responsibility. |
| Payment deadline countdown/urgency visibility | INV-05 (`PRD_v2.0.md:18`) | UI computes urgency thresholds and remaining hours/overdue text; table shows deadline + urgency chip. See `/Users/Caro/Documents/paddock-auction/src/modules/ui/domain/mvp_read_model_stub.ts:412-457`; `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/finance_table.tsx:228-253`. | PASS | Countdown/urgency behavior is present and user-visible. |
| Withdrawal eligibility predicates | FIN-INV-03 (`PRD_v2.0.md:526-531`) | No withdrawal route/component/predicate UI in current frontend surface (`/`, `/auctions`, `/auctions/[auctionId]`, `/finance`). | FAIL | Frontend has no withdrawal desk to enforce or explain eligibility gates (blacklist/compliance predicates). |
| Role-based UI visibility | Role matrix (`PRD_v2.0.md:61-78`) | Navigation and pages are static and not role-conditional. See `/Users/Caro/Documents/paddock-auction/src/modules/ui/transport/components/app_shell.tsx:16-20`, `:46-56`. | FAIL | No role claims/session-driven hiding/locking of actions or routes in UI. |

## Missing UI Enforcement List

1. Pre-bid eligibility preflight UX for approval/blacklist/compliance status (block submit before mutation attempt).
2. Explicit blacklist and not-approved error code mapping with deterministic user guidance.
3. Full PRD state-machine visibility (all states + reasoned unavailable actions per current state).
4. Withdrawal UI flow with predicate checks and policy explanations required by `FIN-INV-03`.
5. Role-based route and action gating aligned to PRD role matrix (at minimum bid, finance, and withdrawal actions).

## Risk Level

**HIGH**

Rationale:
- Direct FAIL on withdrawal predicate enforcement visibility and role-based visibility.
- Multiple core controls are only conditionally represented in UI (backend-dependent without proactive client guardrails).
- Current UI communicates policy well, but does not yet provide complete operator/user-side enforcement affordances for PRD v2.0.
