# PRD v2.0 — UAE B2B Vehicle Auction Platform (Financially Enforced)

## Executive Summary
This platform is a UAE-based, API-first, financially enforced vehicle auction infrastructure for B2B participants (rent-a-car companies and dealers). It is not a classifieds marketplace and does not permit non-committal bidding.

The system enforces pre-funded bidding eligibility, deterministic auction execution, immutable financial records, and region-aware compliance behavior. Phase 1 serves B2B. Phase 2 extends the same core to B2C without changing financial control primitives.

The platform must launch at 100-200 vehicles/month and scale to 100,000+ users with stateless services, horizontal scaling, and event-driven workflows.

## Core Business Invariants

| ID | Invariant | Enforcement |
|---|---|---|
| INV-01 | `NO DEPOSIT = NO BID` | Bid API rejects requests unless deposit lock is active and valid. |
| INV-02 | Manual admin approval required before any bidding access | User and company status checks on every bid and financial endpoint. |
| INV-03 | Blacklisted users/companies cannot bid or withdraw | Hard gate in service layer and DB-backed status checks. |
| INV-04 | Deposit lock is mandatory before first accepted bid in an auction | Atomic lock acquisition in bid transaction. |
| INV-05 | Winner payment deadline is 48 hours from auction close | `payment_deadlines.due_at` enforced by scheduler and payment service. |
| INV-06 | Winner default/refusal burns locked deposit | Default workflow posts penalty ledger entries and updates auction state. |
| INV-07 | Financial, bid, and audit records are immutable | Append-only tables with DB policies/triggers rejecting update/delete. |
| INV-08 | Idempotency is mandatory for bids, payments, and withdrawals | Unique idempotency constraints + deterministic replay response. |
| INV-09 | Invalid state transitions are rejected | Transition validator + `409` response + audit event. |
| INV-10 | Every financial mutation is ledger-backed | No balance/state mutation without balanced ledger entry creation. |

Invariant statements in this document are the canonical business source of truth; implementation topology belongs to `TECH_PLAN.md`, and enforcement doctrine belongs to `TECH_RULES.md`.

### Critical Financial Guarantees

| Guarantee | Technical Control |
|---|---|
| Atomic deposit lock acquisition | DB transaction with row-level lock on wallet and unique active lock constraint. |
| Atomic bid write | Single transaction includes lock validation, bid insert, auction version update, and outbox write. |
| No duplicate bid insertion | `bid_requests` uniqueness on `(auction_id, company_id, idempotency_key)` + replay response cache. |
| No duplicate payment posting | Stripe webhook dedupe by event id + idempotent payment state transitions + unique posting references. |
| No double withdrawal | Atomic fund reservation to `pending_withdrawal_balance` + unique withdrawal idempotency key. |
| No payout without ledger posting | Settlement service requires posted, balanced ledger entries before payout execution. |
| No admin bypass of approval/deposit/blacklist gates | Hard checks in domain services; admin APIs cannot override bid eligibility gates. |
| Immutable audit for every financial mutation | Mandatory append-only `audit_logs` entry with actor, action, entity, payload hash, timestamp. |

## Product Positioning
1. Financial enforcement is primary system behavior.
2. Auction outcomes are deterministic and audit-replayable.
3. Legal/compliance behavior is region-rule driven, versioned, and snapshot-based.
4. Architecture is API-first, stateless, and event-driven.
5. Real-time bidding is concurrency-safe and strongly consistent on write paths.

## Business Model & Monetization

| Revenue Stream | Rule |
|---|---|
| Buyer commission | Applied on winning invoice; configurable by region, tier, and vehicle class. |
| Deposit burn penalty | Locked 5,000 AED burned on payment default/refusal. |
| Service fees | Delivery, export processing, and document processing fees from region rules. |
| VAT | Region-aware VAT visibility and calculation persisted on invoice snapshot. |

### Pricing Controls
1. Commission and fee schedules are versioned and time-effective.
2. Auction captures pricing-rule snapshot at publish and uses it at close.
3. Invoice calculation is deterministic and reproducible from snapshots.

## Role & Permission Matrix

| Capability | Super Admin | Ops Admin | Finance Admin | Compliance Admin | Seller Manager | Buyer Company Admin | Buyer Bidder | Buyer Finance | Support Admin | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
| Approve companies/users | Yes | Yes | No | Yes | No | No | No | No | No | Read |
| Manage blacklist | Yes | Yes | No | Yes | No | No | No | No | No | Read |
| Create/publish auctions | Yes | Yes | No | No | Yes | No | No | No | No | Read |
| Upload/approve inspections | Yes | Yes | No | No | Yes | No | No | No | No | Read |
| Place bids | No | No | No | No | No | No | Yes | No | No | No |
| Manage deposit withdrawals | Yes | No | Yes | No | No | Initiate | No | Initiate/View | No | Read |
| Execute settlement/payout | Yes | No | Yes | No | No | No | No | No | No | Read |
| Configure region rules/templates | Yes | Limited | No | Yes | No | No | No | No | No | Read |
| Review risk/compliance queue | Yes | Yes | No | Yes | No | No | No | No | Limited | Read |
| Moderate support chat | Yes | Yes | No | No | No | No | No | No | Yes | Read |
| View immutable audit/ledger | Yes | Yes | Yes | Yes | Limited | Limited | Limited | Limited | Limited | Yes |
| Run regulatory exports | Yes | No | Yes | Yes | No | No | No | No | No | Read |

Hard bid-entry gates apply to all roles, including admins.

## Auction State Machine (Formal)

### States
`Draft`, `InspectionPending`, `InspectionApproved`, `Scheduled`, `Live`, `Extended`, `Closed`, `PaymentPending`, `Settled`, `Defaulted`, `Canceled`, `Relisted`

### Allowed Transitions

| From | To | Trigger | Guard Conditions |
|---|---|---|---|
| Draft | InspectionPending | Inspection initiated | Vehicle and seller data complete |
| Draft | Canceled | Admin cancel | Audit reason required |
| InspectionPending | InspectionApproved | Inspection approved | Mandatory inspection artifacts present |
| InspectionPending | Canceled | Admin cancel | Audit reason required |
| InspectionApproved | Scheduled | Publish auction | Rule snapshot and legal template snapshot stored |
| InspectionApproved | InspectionPending | Re-open inspection | Reason and version increment required |
| InspectionApproved | Canceled | Admin cancel | Audit reason required |
| Scheduled | Live | Start scheduler | Start time reached and auction valid |
| Scheduled | Canceled | Admin cancel | Audit reason required |
| Live | Extended | Anti-sniping trigger | Valid bid received in extension window |
| Live | Closed | End scheduler | End time reached with no extension |
| Live | Canceled | Admin emergency cancel | Dual approval + reason |
| Extended | Extended | Additional anti-sniping | Max extension not exceeded |
| Extended | Closed | End scheduler | Final end time reached |
| Extended | Canceled | Admin emergency cancel | Dual approval + reason |
| Closed | PaymentPending | Winner finalization | Highest valid bid exists |
| Closed | Relisted | No winner / invalidation | Policy conditions satisfied |
| PaymentPending | Settled | Payment + settlement complete | Invoice settled, ledger posted |
| PaymentPending | Defaulted | Payment deadline missed/final failure | Deposit burn posted |
| Defaulted | Relisted | Relist decision | Compliance/ops approval |
| Canceled | Relisted | Relist decision | Seller approval + ops approval |

Rules:
1. All transitions must be written to `auction_state_transitions` (append-only).
2. Invalid transitions return `409` and create policy-violation audit logs.
3. Transition commits and side-effect events are atomic via outbox pattern.

## Full Auction Lifecycle
1. Company onboarding submission with legal and trade documents.
2. User/company manual admin approval.
3. Deposit funding (minimum available 5,000 AED).
4. Vehicle intake and ownership validation.
5. Auction created in `Draft`.
6. Inspection initiated (`InspectionPending`) 3-5 days before auction.
7. Inspection approved (`InspectionApproved`) with report and media.
8. Auction published (`Scheduled`) with region/legal/pricing snapshots.
9. Auction starts (`Live`) with 24-48 hour duration.
10. Real-time bidding executes with concurrency and idempotency controls.
11. Anti-sniping can move `Live -> Extended`.
12. Auction closes (`Closed`) and winner is finalized.
13. Winner enters `PaymentPending` with 48-hour deadline.
14. If payment succeeds, settlement executes and state becomes `Settled`.
15. If payment fails by deadline, state becomes `Defaulted`, deposit is burned, and relist path is available.
16. Completed transfers close operational workflow with full audit retention.

## Deposit System & Withdrawal Policy

### Deposit Wallet Model
1. One deposit wallet per company per currency.
2. Wallet fields: `available_balance`, `locked_balance`, `pending_withdrawal_balance`.
3. Minimum bidding collateral baseline: 5,000 AED per active auction participation.

### Deposit Lock Rules
1. Lock required before first accepted bid in an auction.
2. Lock acquisition is atomic in bid transaction.
3. Non-winning locks are released on auction close.
4. Winning lock remains collateral through payment outcome.
5. Default/refusal burns locked deposit.
6. Lock reason is always visible in UI.

### Withdrawal Eligibility
Withdrawal is allowed only when all are true:
1. No active deposit locks.
2. No live/extended auction participation.
3. No outstanding invoices.
4. No company or user compliance hold.
5. No open disputes.

### Withdrawal Workflow
1. User submits withdrawal request with idempotency key.
2. System validates eligibility in one transaction.
3. Funds move atomically from `available_balance` to `pending_withdrawal_balance`.
4. Request is created with status `Pending` or `Approved` (auto-approval policy).
5. Approved request moves to `Processing` and executes Stripe refund to original payment method.
6. Success moves request to `Completed` and final ledger postings are written.
7. Failure moves request to `Rejected` or retains `Processing` for retries; reserved funds are restored on terminal failure.

### Withdrawal Status Machine

| From | To | Condition |
|---|---|---|
| Pending | Approved | Admin or auto-approval policy pass |
| Pending | Rejected | Eligibility/compliance/admin rejection |
| Approved | Processing | Stripe request submitted |
| Processing | Completed | Stripe refund confirmed |
| Processing | Rejected | Stripe final failure or compliance stop |

SLA: 3-5 business days from request acceptance to completed refund.

## Stripe Payment Architecture

### Scope
Stripe is the primary processor for:
1. Deposit top-up.
2. Auction buyer payment.
3. Deposit withdrawal/refund to original method.

### Stripe Controls
1. Webhook signature verification is mandatory.
2. Duplicate webhook protection via unique Stripe event id store.
3. Idempotent command processing for payment create/confirm/refund.
4. `stripe_payment_intent_id` is persisted for all payment intents.
5. Payment and webhook handlers are replay-safe.

### Payment State Machine

| State | Meaning |
|---|---|
| Initiated | Payment intent created |
| RequiresAction | Buyer action required (3DS/auth) |
| Processing | Processor accepted; awaiting final status |
| Succeeded | Funds captured/confirmed |
| Failed | Terminal failure |
| Canceled | Canceled by system/user policy |
| Refunded | Funds returned |

Allowed transitions:
1. `Initiated -> RequiresAction | Processing | Failed | Canceled`
2. `RequiresAction -> Processing | Failed | Canceled`
3. `Processing -> Succeeded | Failed`
4. `Succeeded -> Refunded`
5. Invalid transitions rejected with `409`.

### Payment Failure Escalation
1. On payment failure, notify buyer immediately across critical channels.
2. Start retry window: `min(24h from failure, payment_deadline.due_at)`.
3. Create/route case to admin payment escalation queue.
4. If not resolved by deadline, mark default, burn deposit, and emit default events.

## Escrow & Settlement Model

### Ledger Principles
1. Double-entry, immutable ledger.
2. No updates/deletes to posted journal entries or lines.
3. Reversals only via compensating entries.
4. Every financial mutation must produce balanced ledger postings.

### Core Accounts
`BuyerDepositAvailable`, `BuyerDepositLocked`, `BuyerDepositPendingWithdrawal`, `BuyerReceivable`, `SellerPayable`, `CommissionRevenue`, `PenaltyRevenue`, `VATPayable`, `CashClearing`.

### Posting Matrix

| Mutation | Debit | Credit | Preconditions |
|---|---|---|---|
| Deposit top-up success | CashClearing | BuyerDepositAvailable | Stripe payment succeeded |
| Deposit lock acquire | BuyerDepositAvailable | BuyerDepositLocked | Eligible bid path |
| Deposit lock release | BuyerDepositLocked | BuyerDepositAvailable | Non-winner close or settled release rule |
| Deposit burn on default | BuyerDepositLocked | PenaltyRevenue | Auction default confirmed |
| Withdrawal reserve | BuyerDepositAvailable | BuyerDepositPendingWithdrawal | Withdrawal eligibility pass |
| Withdrawal complete | BuyerDepositPendingWithdrawal | CashClearing | Stripe refund confirmed |
| Withdrawal rejection rollback | BuyerDepositPendingWithdrawal | BuyerDepositAvailable | Terminal failure/rejection |
| Invoice recognition | BuyerReceivable | SellerPayable + CommissionRevenue + VATPayable | Auction closed with winner |
| Buyer payment receipt | CashClearing | BuyerReceivable | Payment success |
| Seller payout execution | SellerPayable | CashClearing | Settlement approved and posted |

### Settlement Rules
1. No payout execution before corresponding ledger postings exist and balance.
2. Settlement service checks invoice status, compliance hold, and ledger integrity before payout.
3. Settlement completion emits immutable audit and domain events.

## Bid Processing & Concurrency Control

### Bid API Contract
1. `Idempotency-Key` required for every bid submission.
2. Bid request body includes `auction_id`, `company_id`, `amount`, `bid_request_id`.
3. Missing idempotency key returns `400`.

### Deterministic Bid Processing
1. Authenticate JWT and authorize RBAC scope.
2. Validate approval and blacklist gates.
3. Validate auction state is `Live` or `Extended`.
4. Create/fetch `bid_requests` record by `(auction_id, company_id, idempotency_key)`.
5. If existing successful record with same payload hash, return cached success response.
6. If duplicate key with different payload hash, return `409`.
7. Acquire short-lived distributed lock by `auction_id`.
8. Start DB transaction.
9. Validate increment, reserve policy, and anti-sniping window.
10. Acquire/validate deposit lock atomically.
11. Insert bid row (append-only).
12. Optimistic update auction version (`WHERE version = expected_version`).
13. Write outbox events and commit.
14. Release distributed lock.
15. Publish real-time update to subscribers.

### Concurrency and Duplication Guarantees
1. No duplicate bid insertion under retries/timeouts.
2. No lost accepted bid after commit.
3. No out-of-order final winner decision within one auction shard key.
4. Anti-sniping extension is computed from committed bid timestamps only.

## Region Rules Engine & Geo-IP Reconciliation

### Rule Engine Inputs
1. Buyer operating region.
2. Seller region.
3. Destination/export region.
4. Vehicle class.
5. Auction type.
6. Locale preference.

### Rule Engine Outputs
1. Delivery pricing policy.
2. Export eligibility and restrictions.
3. Required document set.
4. Legal agreement template id.
5. VAT visibility and treatment.
6. Compliance message key.
7. Default language route (`/en`, `/ru`, `/ar`).

### Rule Evaluation Model
1. Rules are versioned, effective-dated, and centrally evaluated.
2. Auction publish stores immutable rule snapshot.
3. Active auctions do not inherit mid-auction rule changes.
4. Rule decisions are auditable and replayable.

### Geo-IP Reconciliation
1. Capture Geo-IP at login and bid submission.
2. Compare detected region to declared operating region.
3. On mismatch, log risk event, adjust risk score, and optionally require step-up verification.
4. High-risk mismatches can block bidding pending manual review.
5. Region decision evidence is stored for audit.

## Risk & Fraud Control Engine

### Inputs
1. Bid velocity and frequency anomalies.
2. Device fingerprint reuse and anomaly patterns.
3. Payment failures/default history.
4. Geo-IP mismatch events.
5. Network and identity linkage to blacklisted entities.
6. Dispute frequency and severity.

### Scoring Model
1. Risk score is maintained at user and company levels.
2. Score updates are event-driven and timestamped.
3. Scoring changes are recorded in immutable risk events.

### Enforcement Tiers

| Tier | Score Range | Action |
|---|---|---|
| Low | Policy-defined low band | Monitor only |
| Medium | Policy-defined mid band | Step-up verification and rate limits |
| High | Policy-defined high band | Temporary trading freeze + admin review |
| Critical | Policy-defined critical band | Compliance hold and mandatory investigation |

### Controls
1. Bid rate limiting and velocity checks.
2. Device fingerprint checks on auth and high-risk actions.
3. Automated escalations to compliance queue.
4. Manual override allowed only with reason and audit, never bypassing core gates.

## AML/KYC Extension Readiness
1. Provider abstraction for KYC verification and sanctions screening.
2. AML triggers include large transaction threshold, suspicious risk score threshold, and repeated default/dispute patterns.
3. `compliance_hold` blocks bidding, withdrawal, and settlement actions.
4. SAR case creation hook is available for regulatory reporting workflows.
5. Compliance actions and outcomes are immutable and auditable.

## Security Architecture
1. JWT-based authentication with short-lived access tokens and rotating refresh tokens.
2. MFA mandatory for all admin roles.
3. Strict RBAC with tenant/company scoping and region-aware access rules.
4. API gateway enforces authn/authz, rate limits, and abuse controls.
5. Financial endpoints require idempotency keys.
6. TLS in transit and encryption at rest for sensitive data.
7. Secret management via centralized vault.
8. WAF and bot mitigation on internet-facing endpoints.
9. Immutable audit logs for privileged and financial actions.
10. No bid path bypass for approval, blacklist, or deposit checks, including admin interfaces.
11. Stripe webhook endpoints enforce signature verification and replay protection.

## Data Model (Complete Production Schema)

### Global Data Constraints
1. Primary keys are UUIDs.
2. All tables include `created_at`; mutable tables include `updated_at`.
3. Append-only tables reject update/delete at DB level.
4. Financial references use deterministic source ids for idempotent posting.

### Core Schema

| Table | Purpose | Key Fields | Constraints |
|---|---|---|---|
| `companies` | Legal bidding entities | `id`, `status`, `compliance_hold` | Unique trade license; status enum |
| `users` | Platform users | `id`, `email`, `mfa_enabled`, `compliance_hold` | Unique email/phone |
| `user_company_roles` | Tenant role mapping | `user_id`, `company_id`, `role` | Unique tuple `(user_id, company_id, role)` |
| `approval_records` | Manual approval decisions | `entity_type`, `entity_id`, `decision` | Append-only |
| `blacklist_entries` | Ban registry | `entity_type`, `entity_id`, `reason`, `effective_from` | Active-interval checks |
| `regions` | Region catalog | `region_code` | Unique region code |
| `region_rule_sets` | Versioned rules | `region_code`, `version`, `effective_from` | Unique `(region_code, version)` |
| `legal_templates` | Locale legal terms | `template_key`, `locale`, `version` | Unique `(template_key, locale, version)` |
| `vehicles` | Vehicle master | `id`, `vin`, `seller_company_id` | Unique VIN index |
| `inspection_reports` | Inspection versions | `vehicle_id`, `version`, `status` | Immutable versions |
| `inspection_media` | Inspection artifacts | `inspection_report_id`, `checksum`, `storage_ref` | Content checksum indexed |
| `auctions` | Auction aggregate | `id`, `state`, `version`, `starts_at`, `ends_at` | `starts_at < ends_at`; state enum |
| `auction_state_transitions` | State history | `auction_id`, `from_state`, `to_state`, `triggered_by`, `reason` | Append-only |
| `bids` | Accepted bids | `auction_id`, `company_id`, `user_id`, `amount`, `sequence_no` | Append-only |
| `bid_requests` | Bid idempotency | `auction_id`, `company_id`, `idempotency_key`, `request_hash`, `bid_id` | Unique `(auction_id, company_id, idempotency_key)` |
| `deposit_wallets` | Company collateral wallet | `company_id`, `currency`, `available_balance`, `locked_balance`, `pending_withdrawal_balance` | Unique `(company_id, currency)`; non-negative balances |
| `deposit_locks` | Auction collateral lock | `auction_id`, `company_id`, `amount`, `status` | One active lock per `(auction_id, company_id)` |
| `deposit_withdrawal_requests` | Withdrawal workflow | `company_id`, `amount`, `status`, `idempotency_key`, `stripe_refund_reference` | Status enum; unique `(company_id, idempotency_key)` |
| `deposit_withdrawal_request_events` | Withdrawal state history | `withdrawal_request_id`, `from_status`, `to_status`, `actor_id` | Append-only |
| `invoices` | Buyer payable docs | `auction_id`, `buyer_company_id`, `total`, `status`, `due_at` | One active invoice per winning auction |
| `payments` | Payment intents/attempts | `invoice_id`, `status`, `stripe_payment_intent_id`, `failure_reason_code` | Unique payment intent id per intent |
| `payment_webhook_events` | Stripe webhook dedupe | `stripe_event_id`, `event_type`, `processed_at` | Unique `stripe_event_id` |
| `payment_deadlines` | Deadline tracking | `auction_id`, `buyer_company_id`, `due_at`, `status`, `escalated_flag` | One active deadline per auction/buyer |
| `settlements` | Seller payout lifecycle | `auction_id`, `seller_company_id`, `status`, `payout_ref` | One settlement record per settled auction |
| `ledger_accounts` | Chart of accounts | `code`, `type`, `currency` | Unique account code |
| `ledger_entries` | Journal headers | `id`, `source_type`, `source_id`, `posted_at` | Append-only; unique `(source_type, source_id)` |
| `ledger_lines` | Journal lines | `entry_id`, `account_id`, `debit`, `credit` | Append-only; balanced per entry |
| `idempotency_keys` | Cross-endpoint idempotency | `actor_id`, `endpoint`, `key`, `request_hash`, `response_ref` | Unique `(actor_id, endpoint, key)` |
| `outbox_events` | Transactional event outbox | `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status` | Reliable publish with retries |
| `notifications` | Notification aggregate | `entity_type`, `entity_id`, `template_key`, `status`, `escalated_flag` | Multi-channel summary state |
| `notification_attempts` | Delivery evidence | `notification_id`, `channel`, `provider_ref`, `status`, `attempt_no` | Append-only; indexed by SLA fields |
| `risk_scores` | Current risk score | `entity_type`, `entity_id`, `score`, `reason`, `updated_at` | Unique `(entity_type, entity_id)` |
| `risk_events` | Risk event stream | `entity_type`, `entity_id`, `event_type`, `weight`, `evidence_ref` | Append-only |
| `disputes` | Dispute management | `entity_type`, `entity_id`, `dispute_reason`, `status`, `evidence_storage_ref` | Status-indexed |
| `device_fingerprints` | Device trust signals | `user_id`, `fingerprint_hash`, `first_seen_at`, `last_seen_at` | Indexed by hash and user |
| `audit_logs` | Immutable action log | `actor_id`, `action`, `entity_type`, `entity_id`, `payload_hash` | Append-only |
| `admin_overrides` | Controlled override actions | `override_type`, `entity_ref`, `requested_by`, `approved_by`, `reason` | Dual-approval where required |
| `regulatory_exports` | Reporting manifest | `report_type`, `period_start`, `period_end`, `checksum`, `storage_ref` | Immutable export record |
| `chat_threads` | Support thread root | `linked_entity_type`, `linked_entity_id`, `status` | Access scoped by tenant and role |
| `chat_messages` | Support conversation | `thread_id`, `sender_id`, `message_body`, `attachment_ref` | Append-only |
| `chat_moderation_actions` | Moderation history | `thread_id`, `action`, `actor_id`, `reason` | Append-only |

### Append-Only Tables
`approval_records`, `auction_state_transitions`, `bids`, `deposit_withdrawal_request_events`, `ledger_entries`, `ledger_lines`, `notification_attempts`, `risk_events`, `audit_logs`, `chat_messages`, `chat_moderation_actions`.

## Notification & Event Architecture

### Event Delivery Model
1. Outbox pattern from primary DB to event bus.
2. At-least-once delivery with consumer idempotency.
3. Dead-letter queues for poison events.
4. Exponential backoff retries.

### Core Domain Events
`CompanyApproved`, `CompanyBlacklisted`, `DepositCredited`, `DepositLocked`, `DepositReleased`, `DepositBurned`, `DepositWithdrawalRequested`, `DepositWithdrawalCompleted`, `AuctionPublished`, `AuctionStarted`, `BidPlaced`, `BidOutbid`, `AuctionExtended`, `AuctionClosed`, `AuctionWon`, `PaymentDeadlineApproaching`, `PaymentFailed`, `PaymentReceived`, `PaymentDefaulted`, `SettlementCompleted`, `DisputeOpened`, `ComplianceHoldApplied`.

### Critical Notification SLA
1. Applies to payment deadlines and deposit burn/default notices.
2. First multi-channel delivery attempt starts within 60 seconds.
3. Retry policy: 3 attempts across 30 minutes.
4. Undelivered notifications escalate to admin queue.
5. Evidence for every attempt is stored in `notification_attempts`.

## SEO Architecture
1. SSR for public listing and vehicle pages.
2. Locale-based URLs: `/en`, `/ru`, `/ar`.
3. Auto locale detection is supported; user override persists and prevails.
4. Hreflang clusters are complete and reciprocal across locales.
5. Structured data includes `Vehicle` and `Offer` schema on eligible pages.
6. Filtered/faceted URLs default to `noindex,follow`.
7. Faceted canonical points to base listing per locale.
8. Exactly one canonical URL per locale page.
9. Duplicate vehicle pages are prevented via canonical normalization and redirects.
10. Sitemap is segmented by language and region.
11. Core Web Vitals targets: LCP < 2.5s, CLS < 0.1, INP < 200ms.
12. Private routes (`/account`, bidding, finance, admin) are always `noindex`.

## Admin Panel & Governance Controls

| Module | Scope |
|---|---|
| Onboarding & Approval | Company/user approvals, rejection reasons, decision history |
| Blacklist Control | Add/remove blacklist entries with effective dates and evidence |
| Auction Operations | Create, publish, cancel, relist, anti-sniping settings |
| Inspection Operations | Assignment, report approval, completeness checks |
| Finance Operations | Deposits, locks, burns, invoices, payment monitoring |
| Withdrawal Queue | Pending/approved/processing/rejected/completed workflows |
| Payment Escalation Queue | Failed intents, retry tracking, deadline monitoring |
| Settlement Operations | Payout readiness checks, settlement execution |
| Region & Legal Rules | Versioned rules, legal templates, compliance messaging |
| Risk & Geo-IP Console | Risk events, mismatch review, step-up actions |
| Disputes Console | Dispute lifecycle, evidence, resolution notes |
| Audit & Ledger Explorer | Immutable logs and journals |
| Chat Moderation | Thread moderation and transcript export |
| Override Desk | Controlled overrides with dual approval and mandatory reason |

Governance rules:
1. Overrides cannot bypass approval/deposit/blacklist bid gates.
2. High-impact overrides require dual approval and immutable audit.
3. Every admin action is attributable and non-repudiable.

## Reporting & Regulatory Hooks
1. Regulatory export module supports scheduled and on-demand runs.
2. Export formats: CSV and JSON with immutable manifest and checksum.
3. Financial reconciliation report compares ledger, Stripe settlements, and bank clearing.
4. Deposit burn report segments by reason, company, region, and auction.
5. Payment default analytics includes retry outcomes and cohort trends.
6. Risk dashboard summarizes score changes, geo mismatches, and enforcement actions.
7. Admin override report captures actor, reason, scope, and outcome.

## Chat Support Module
1. In-platform chat threads can be linked to auction, dispute, or payment entities.
2. Conversations are immutable and append-only.
3. RBAC controls thread visibility by company and role.
4. Moderation actions are logged with reason code and actor.
5. Transcript export is available with integrity metadata for compliance review.

## Edge Case Handling

| Scenario | Deterministic Handling |
|---|---|
| Two bids at same millisecond | Optimistic versioning accepts one; other retries against new state. |
| Client retries same bid after timeout | Existing `bid_requests` response is returned; no duplicate bid row created. |
| Duplicate Stripe webhook delivery | Duplicate event id ignored after first successful processing. |
| Payment intent fails near deadline | Retry window allowed until `min(failure+24h, due_at)`; default after expiry. |
| Redis lock unavailable | Fallback to DB transaction/optimistic lock path; reduced throughput, integrity preserved. |
| WebSocket outage | Bid writes continue; clients use polling; replay events on reconnect. |
| Approval revoked during live auction | Existing bids remain; new bid attempts blocked immediately. |
| Company blacklisted mid-auction | New bids blocked; post-close obligations continue under policy. |
| Region rules changed during live auction | Active auction uses stored snapshot only. |
| Auction canceled after bids | Auction transitions to `Canceled`; locks released; audit reason mandatory. |
| Withdrawal requested with open dispute | Request rejected with deterministic reason code. |
| Late payment callback after default | Route to exception queue; no auto-reversal without finance/compliance approval. |
| DB failover | Controlled degradation; writes resume after leader recovery; idempotent retries required. |

## FINANCIAL_CONTROL_SECTION

Cross-Reference: `TECH_RULES` `S3/S4/S6`; `critical_financial_modules.yaml`.

FIN-INV-01:
Statement: Bid acceptance requires an active eligible deposit lock.
Scope: Bid acceptance.
Enforcement Surface: Bid financial gate.
Failure Mode: Deterministic rejection.
Auditability Requirement: Immutable decision record.

FIN-INV-02:
Statement: Deposit lifecycle supports only valid transitions: lock, release, burn.
Scope: Lock lifecycle for auction participation.
Enforcement Surface: Lock lifecycle policy.
Failure Mode: Command rejected.
Auditability Requirement: Immutable lock resolution record.

FIN-INV-03:
Statement: Withdrawal acceptance requires all eligibility predicates pass, including blacklist and compliance gates.
Scope: Withdrawal intake and approval.
Enforcement Surface: Withdrawal gate.
Failure Mode: Deterministic rejection.
Auditability Requirement: Eligibility snapshot retained.

FIN-INV-04:
Statement: Settlement requires confirmed payment capture; only legal-order override is permitted.
Scope: `PaymentPending -> Settled`.
Enforcement Surface: Settlement precondition gate.
Failure Mode: Settlement blocked.
Auditability Requirement: Immutable payment/override evidence.

FIN-INV-05:
Statement: Payout execution requires receivable closure and prior balanced ledger postings for the same business source.
Scope: Seller payout command.
Enforcement Surface: Settlement sequencing gate.
Failure Mode: Payout blocked.
Auditability Requirement: Immutable settlement and ledger references.

FIN-INV-06:
Statement: Every accepted financial command has one deterministic ledger source record.
Scope: Deposit, withdrawal, payment, settlement commands.
Enforcement Surface: Ledger source uniqueness policy.
Failure Mode: Duplicate or missing posting is rejected.
Auditability Requirement: Immutable ledger source trace.

FIN-INV-07:
Statement: Financial outcomes must remain reconcilable across internal postings and external references.
Scope: End-of-command and scheduled reconciliation checks.
Enforcement Surface: Reconciliation controls.
Failure Mode: Exception state; silent compensation forbidden.
Auditability Requirement: Reconciliation status retained.

| Command | Debit Account | Credit Account | Preconditions | Idempotency Key |
|---|---|---|---|---|
| Deposit Top-Up | CashClearing | BuyerDepositAvailable | Capture confirmed | `topup_key` |
| Lock Acquire | BuyerDepositAvailable | BuyerDepositLocked | Bid gate pass | `lock_acquire_key` |
| Lock Burn | BuyerDepositLocked | PenaltyRevenue | Default confirmed | `lock_burn_key` |
| Withdrawal Reserve | BuyerDepositAvailable | BuyerDepositPendingWithdrawal | Eligibility pass | `withdrawal_reserve_key` |
| Withdrawal Complete | BuyerDepositPendingWithdrawal | CashClearing | Refund confirmed | `withdrawal_complete_key` |
| Payout Execute | SellerPayable | CashClearing | Settlement pass | `payout_key` |

## DATA_INTEGRITY_SECTION

Cross-Reference: `TECH_RULES` `S3/S10`; `table_ownership.yaml`; `shared_paths.yaml`.

DATA-INV-01:
Statement: Append-only entities reject update/delete after commit.
Scope: Append-only records.
Enforcement Surface: Persistence policy.
Failure Mode: Mutation rejected.
Auditability Requirement: Rejected attempts traceable.

DATA-INV-02:
Statement: External mutation commands persist idempotency identity and request hash before success response.
Scope: Bid, payment, and withdrawal mutations.
Enforcement Surface: Idempotency record policy.
Failure Mode: Replay mismatch returns deterministic conflict; unsafe replay forbidden.
Auditability Requirement: Idempotency records retained per policy TTL.

DATA-INV-03:
Statement: Required coupled writes commit atomically or not at all.
Scope: Financial mutations and state transitions requiring ledger/outbox coupling.
Enforcement Surface: Transaction boundary policy.
Failure Mode: Full rollback; partial success forbidden.
Auditability Requirement: Transaction failure reason attributable.

DATA-INV-04:
Statement: Concurrent mutations on shared financial aggregates follow deterministic lock order with authoritative row-level locks.
Scope: Wallet, lock, payment, settlement, auction versioned writes.
Enforcement Surface: Isolation and locking policy.
Failure Mode: Bounded retry or deterministic failure; non-idempotent retry forbidden.
Auditability Requirement: Contention/retry outcomes observable.

DATA-INV-05:
Statement: Referential boundaries prevent orphaned child records and cross-context direct writes.
Scope: Financial and lifecycle dependencies across owned tables.
Enforcement Surface: Referential constraints, ownership manifest, shared path policy.
Failure Mode: Commit or CI rejection.
Auditability Requirement: Violations and waivers are traceable.

DATA-INV-06:
Statement: Schema evolution follows compatibility-first expansion and contract window; destructive migration of immutable history is forbidden.
Scope: Production schema changes.
Enforcement Surface: Migration governance controls.
Failure Mode: Migration blocked.
Auditability Requirement: Compatibility annotations retained.

DATA-INV-07:
Statement: Backfills must be deterministic, idempotent, resumable, and forward-compensating.
Scope: Data correction and enrichment workflows.
Enforcement Surface: Backfill governance controls.
Failure Mode: Backfill halted; destructive rollback forbidden.
Auditability Requirement: Backfill metadata and checksums retained.

| Transaction Boundary | Atomic Mutations Required | External Side Effect Timing | Idempotency Scope |
|---|---|---|---|
| Bid Accept | Bid + version + lock + outbox | Post-commit | `(auction_id, company_id, key)` |
| Payment Posting | Payment state + ledger + outbox | Post-commit | `(endpoint, actor, key)` |
| Withdrawal Flow | Wallet + request state + ledger/outbox | Post-commit | `(company_id, key)` |
| Settlement | Settlement state + payout ledger + outbox | Post-commit | `(auction_id, seller_company_id, key)` |

| Migration Safety Check | Required Condition | Blocker if Failed |
|---|---|---|
| Compatibility Window | Contract window satisfied | Migration blocked |
| Expand-Contract | Add before remove | Migration blocked |
| Immutable History | No destructive operation | Migration blocked |
| Backfill Safety | Idempotent and resumable | Backfill blocked |
| Rollback Path | Forward-compensating path defined | Deployment blocked |
| Ownership Boundary | Aligns with `table_ownership.yaml` and `shared_paths.yaml` | Migration blocked |

## Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99.9% monthly for core API |
| Bid write latency | p95 < 500ms |
| Real-time update latency | p95 < 1s from commit to subscriber |
| Consistency | Strong consistency on bids, locks, invoices, ledger postings |
| Durability | No acknowledged financial or bid write loss |
| RPO/RTO | RPO <= 5 minutes, RTO <= 30 minutes |
| Security | MFA for admins, JWT auth, strict RBAC, WAF, encryption at rest/in transit |
| Auditability | 100% coverage for financial and privileged actions |
| Notification SLA | First critical attempt within 60s; 3 retries in 30 min |
| Localization | EN/RU/AR support with locale-aware formatting and routing |
| Compliance | Versioned legal/rule traceability and evidence retention |

## Scalability Strategy
1. Stateless services on horizontally scalable containers.
2. PostgreSQL primary with read replicas and connection pooling.
3. Partition high-volume append-only tables (bids, audit, risk events, notification attempts).
4. Redis cluster for distributed locks, cache, and rate limiting.
5. Event bus partitioning by aggregate keys (`auction_id`, `company_id`) for ordered processing where needed.
6. WebSocket gateway scaled with pub/sub backplane.
7. Outbox-based event publishing to guarantee consistency between DB and events.
8. Separate hot paths (`Bid Processor`, `Payment Processor`, `Notification Service`) for independent scaling.
9. Target capacity supports 100,000+ users, burst bid throughput, and concurrent live auctions.

## Phase 2 (B2C Expansion Model)
1. Introduce individual onboarding with KYC and sanctions checks.
2. Preserve core invariants: no deposit, no bid; immutable ledger; idempotent financial operations.
3. Apply risk-tiered deposit requirements for consumer segments.
4. Add consumer dispute workflows and support SLAs.
5. Expand payment options while retaining Stripe-centric orchestration.
6. Reuse auction engine, state machine, and financial controls without redesign.
7. Roll out by region with rule-engine feature gating and compliance sign-off.
