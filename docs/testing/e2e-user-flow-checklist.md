# E2E Product User Flows Testing Checklist

Reviewed from frontend and backend code on March 19, 2026.

Source basis:
- `app/` Next.js routes and interactive components
- `backend/src/routes/` Fastify API and websocket handlers
- `src/modules/` auction, bidding, wallet, billing, deposit, and scheduler services
- route, integration, and module tests under `backend/src/routes/__tests__/`, `tests/integration/`, and `src/modules/**/*.test.ts`

## North Star

These are the flows that should never silently regress before rollout:

1. Buyer and seller accounts can register and log in, but admin approval still gates money-moving or buyer-facing actions.
2. No deposit means no bid and no Buy Now.
3. Seller-created inventory becomes a draft auction; seller cannot self-publish.
4. Auction timing changes are scheduler-driven and anti-sniping can extend live auctions.
5. Invoice and payment flows are idempotent and replay-safe.
6. Payment default burns the winner deposit once, and losing deposits are released.

## Priority Scale

- `10`: release-blocking, financial, access-control, or auction-outcome risk
- `8-9`: core user journey, high-frequency, or strong operational impact
- `5-7`: important supporting flow, should be in normal regression suite
- `1-4`: legacy, alternate, low-traffic, or low-impact route

## Scope Notes

- `API-backed primary buyer workspace`: `/dashboard`, `/watchlist`, `/wallet`, `/my-bids`, `/invoices`, `/profile`, lot detail, live room, seller workspace, admin workspace.
- `Read-model or alternate UX still present in repo`: `/finance`, `/finance/invoices/[invoiceId]`, `/buyer/wishlist`, some homepage/read-model surfaces in `src/modules/ui/domain/marketplace_read_model.ts`.
- `Important implementation nuance`: buyer and seller users can currently log in before approval, but `deposit`, `bid`, `buy now`, and seller publishing actions are blocked later by account-status checks.
- `Important rollout nuance`: some admin capabilities exist in backend even when the current UI only exposes a subset, so backend-only operational flows are included below.

## Flow Checklist

## 1. Public Marketplace And Discovery

### PUB-01 Home page discovery and navigation
- Main flow: visitor lands on `/`, sees live or scheduled inventory, category sections, value proposition blocks, and can navigate to auctions, registration, or seller marketing sections.
- Variations:
  - homepage has at least one live lot
  - homepage has only scheduled lots
  - homepage has no lots and hides ticker/category sections cleanly
  - locale and currency preferences change displayed copy and price formatting
- Edge cases:
  - lots missing images fall back to `/vehicle-photo.svg`
  - category inference changes based on make and body type
  - mixed live and scheduled lots sort correctly
- Importance: `6`

### PUB-02 Auction catalog browse, filter, and sort
- Main flow: visitor opens `/auctions`, browses lots, applies filters, applies sort, and opens a lot card.
- Variations:
  - filter by brand, model, status, region, body type, fuel type, min/max price, max mileage, min year
  - sort by ending soon, newest, price ascending, price descending
  - URL query state persists and reloads correctly
  - VIP teaser cards appear only when no discovery filters are active
- Edge cases:
  - invalid min/max price combinations get sanitized
  - status filtering handles `LIVE`, `EXTENDED`, and `SCHEDULED` correctly
  - lots without current public pre-bids show pre-bid placeholders instead of price
- Importance: `7`

### PUB-03 Public lot detail page
- Main flow: visitor opens `/auctions/[auctionId]`, sees gallery, specs, bid panel, bid history, inspection, and similar lots.
- Variations:
  - scheduled lot with no bids yet
  - scheduled lot with visible pre-bids
  - live or extended lot
  - closed, payment-pending, defaulted, or ended lot
  - similar lots come from API payload vs fallback list
- Edge cases:
  - unknown lot returns custom not-found page
  - missing optional vehicle data renders safe placeholders
  - breadcrumb, metadata, and mobile bid bar change with locale and state
- Importance: `8`

### PUB-04 Public bid history and auction detail APIs
- Main flow: unauthenticated user can fetch public auction listings, auction detail, and paginated bid history where allowed.
- Variations:
  - bid history with next cursor
  - bid history final page with `nextCursor = null`
  - custom `limit` value
  - buy-now price exposed in public list and detail responses
- Edge cases:
  - invalid `limit`
  - `limit` above max
  - unknown auction returns `404`
  - VIP-restricted inventory stays hidden or teaser-only
- Importance: `8`

### PUB-05 Live room access and websocket behavior
- Main flow: authenticated viewer opens `/auctions/live/[auctionId]`, gets initial snapshot, receives realtime updates, and sees connection status.
- Variations:
  - initial snapshot from HTTP only
  - websocket connects and streams updates
  - reconnect after disconnect
  - authenticated buyer vs authenticated non-buyer viewer
- Edge cases:
  - missing token closes socket with `4401`
  - unknown auction sends error frame and closes
  - realtime visibility blocked by VIP access policy
  - websocket unavailable but page still loads with initial snapshot
- Importance: `8`

## 2. Authentication And Account Recovery

### AUTH-01 Buyer registration
- Main flow: user registers on `/register/buyer`, account, company, and company membership are created atomically, then user is logged in and redirected to `/dashboard`.
- Variations:
  - UAE default country vs other countries
  - city autocomplete backed by country dataset
  - generated company registration number vs provided one
- Edge cases:
  - password confirmation mismatch
  - blank company name, country, city, or phone
  - duplicate email or company conflict returns `409`
  - buyer registration requires city/emirate
- Importance: `8`

### AUTH-02 Seller registration
- Main flow: company registers on `/register/seller`, seller account and company are created, terms are accepted, then user is logged in and redirected to `/seller/dashboard`.
- Variations:
  - terms modal opens and closes
  - seller company created with phone and country
- Edge cases:
  - terms not accepted
  - phone missing
  - company name empty
  - duplicate email conflict
- Importance: `8`

### AUTH-03 Login and role-based redirect
- Main flow: user logs in through `/login`, `/login/buyer`, or `/login/seller`, gets httpOnly cookie, and is redirected to the correct workspace.
- Variations:
  - buyer logs in through buyer page
  - seller logs in through seller page
  - admin logs in through generic login
  - token read through cookie on server pages
- Edge cases:
  - wrong password
  - missing password hash
  - invalid email format
  - malformed, expired, or deleted-user token on `/me`
  - wrong role used on buyer/seller login page shows UI warning
- Importance: `9`

### AUTH-04 Logout and session reset
- Main flow: logout clears the `token` cookie and routes user back to login.
- Variations:
  - logout from market header
  - logout from buyer shell
  - logout from admin sidebar
- Edge cases:
  - logout endpoint succeeds without existing auth token
  - protected page reload after logout redirects to login
- Importance: `7`

### AUTH-05 Forgot password and passcode reset
- Main flow: user requests passcode, receives generic success response, submits code plus new password, and is auto-logged in.
- Variations:
  - resend passcode after entering confirm step
  - buyer vs seller vs admin post-reset redirect
  - known account vs unknown account both return same request response
- Edge cases:
  - invalid or expired code
  - attempt counter increments and eventually consumes code
  - password mismatch
  - request cooldown prevents excessive resends
- Importance: `8`

## 3. Buyer Onboarding, Status, And Profile

### BUY-01 Buyer dashboard onboarding states
- Main flow: buyer opens `/dashboard` and sees metrics, onboarding step, deposit state, recommended lots, and VIP state.
- Variations:
  - onboarding step `1`: not verified
  - onboarding step `2`: verified but no required deposit
  - onboarding step `3`: deposit ready but no activity
  - onboarding step `4`: active bid/watchlist/invoice activity exists
  - standard vs VIP tier capability card
- Edge cases:
  - no recommended lots because buyer already has active bids
  - no company name or email falls back safely
  - pending or inactive account still loads workspace but with blocked-action messaging
- Importance: `9`

### BUY-02 Pending, inactive, or KYC-pending buyer status handling
- Main flow: buyer can still access dashboard/profile/watchlist-style read flows, but transactional actions are blocked.
- Variations:
  - `PENDING_APPROVAL`
  - `BLOCKED`
  - company pending while user active
  - KYC not verified
- Edge cases:
  - bid endpoints return `ACCOUNT_PENDING_APPROVAL`, `ACCOUNT_INACTIVE`, or `KYC_PENDING`
  - wallet deposit endpoint blocks pending approval and KYC pending
  - lot detail gate messaging points user to login or wallet
- Importance: `10`

### BUY-03 Buyer profile and VIP status
- Main flow: buyer opens `/profile`, sees company details, account status, buyer tier, and VIP upgrade CTA when standard.
- Variations:
  - standard buyer
  - active VIP buyer
  - VIP buyer near expiry
  - expired VIP state
- Edge cases:
  - missing phone, trade licence, or member-since data
  - status badge formatting for non-active states
- Importance: `6`

### BUY-04 VIP upgrade flow
- Main flow: standard buyer opens VIP modal, submits upgrade, company tier is set to VIP, request record is stored as approved, and UI refreshes.
- Variations:
  - first VIP activation
  - already-VIP buyer opens modal again and receives active dates
  - VIP status card shows expiry calculations
- Edge cases:
  - modal error path on failed upgrade request
  - promo copy expires on a fixed date in UI and should not break after May 1, 2026
- Importance: `7`

### BUY-05 Legacy pending VIP request endpoint
- Main flow: backend `/api/buyer/vip-request` either reuses an existing pending request or creates a new one.
- Variations:
  - existing pending request reused
  - new pending request created
- Edge cases:
  - route currently has no obvious first-class UI in main buyer shell
- Importance: `3`

## 4. Buyer Discovery, Watchlist, And Engagement

### BUY-06 Add or remove watchlist entry from lot cards and bid panel
- Main flow: buyer toggles watchlist from auction cards or lot detail, item is added or removed, and UI stays in sync.
- Variations:
  - add from catalog card
  - remove from catalog card
  - add from lot detail
  - remove from lot detail
  - remove from watchlist page
- Edge cases:
  - unauthenticated user is redirected to login from detail page action
  - optimistic UI reverts on API failure
  - VIP-restricted lot cannot be watchlisted and returns `LOT_UNAVAILABLE`
  - unknown lot returns `LOT_NOT_FOUND`
- Importance: `7`

### BUY-07 Watchlist page and filters
- Main flow: buyer opens `/watchlist`, sees saved lots, filters by all/live/scheduled/ending soon, and navigates back to browse.
- Variations:
  - empty watchlist
  - all filter
  - live or extended lots
  - scheduled lots
  - ending within 24h
  - paginated backend response with cursor
- Edge cases:
  - filter result empty while overall watchlist is non-empty
  - watchlisted item removed from current page while filter is active
- Importance: `6`

### BUY-08 Legacy `/buyer/wishlist` page
- Main flow: old client-only wishlist page loads items from buyer wishlist API and allows removal.
- Variations:
  - buyer token in local storage
  - non-buyer role redirect
  - empty state
- Edge cases:
  - page is not linked from current main navigation
  - payload shape differs from current `/watchlist` page contract
- Importance: `2`

### BUY-09 My bids page
- Main flow: buyer opens `/my-bids` and sees grouped statuses for active and completed bid outcomes.
- Variations:
  - `WINNING`
  - `OUTBID`
  - `WON_PAYMENT_DUE`
  - `PAID`
  - empty state with CTA back to auctions
- Edge cases:
  - status priority sorting
  - invoice anchor link exists or falls back to `/invoices`
  - city fallback when seller company metadata is missing
- Importance: `8`

## 5. Buyer Bidding And Auction Outcome

### BUY-10 First pre-bid on a scheduled lot
- Main flow: active buyer with KYC and deposit opens a scheduled lot with no prior bids, enters the first manual pre-bid amount, and public current price is established.
- Variations:
  - first pre-bid from lot detail page
  - first pre-bid through API only
- Edge cases:
  - manual amount missing or invalid
  - scheduled lot start time already passed
  - VIP access restriction blocks early inventory
- Importance: `10`

### BUY-11 Subsequent pre-bid on a scheduled lot
- Main flow: scheduled lot already has a public price, buyer places the exact next increment and bid is accepted.
- Variations:
  - exact `current + minIncrement`
  - repeated pre-bids from same buyer
- Edge cases:
  - skipped increment rejected
  - bid at or below current price rejected
  - idempotency key reused with different amount rejected
- Importance: `9`

### BUY-12 Live bidding on live or extended lot
- Main flow: active buyer with KYC and deposit clicks live bid, next increment is placed, bid count updates, and success response is cached for idempotent replay.
- Variations:
  - first successful live bid
  - repeat same request returns cached success
  - subsequent live bids continue laddering
- Edge cases:
  - no auth
  - auth token missing company id
  - account pending approval
  - KYC pending
  - no active deposit lock available
  - amount not higher than current price
  - amount below minimum increment
  - auction not active or already ended
  - optimistic lock/version update conflict
- Importance: `10`

### BUY-13 Bid idempotency, replay, and failure states
- Main flow: every bid request writes a `bid_requests` record and resolves to `SUCCEEDED`, `REJECTED`, or `FAILED`.
- Variations:
  - succeeded request replayed from cache
  - rejected request replayed from cache
  - in-progress duplicate returns conflict
  - different payload with same idempotency key returns conflict
- Edge cases:
  - locked auction row missing
  - unexpected transaction error marks request as `FAILED`
  - business-rule failure marks request as `REJECTED`
- Importance: `10`

### BUY-14 Anti-sniping extension
- Main flow: buyer places a valid bid with less than three minutes left; auction end time is extended by three minutes and live snapshot updates.
- Variations:
  - exactly inside extension window
  - multiple late bids causing multiple extensions
- Edge cases:
  - bid earlier than extension window should not extend
  - extension should not break countdown or live room progress UI
- Importance: `9`

### BUY-15 VIP Buy Now before auction start
- Main flow: VIP buyer with required deposit buys a scheduled lot before start, auction moves to `PAYMENT_PENDING`, buyer becomes winner, losing locks are released, and invoice is issued.
- Variations:
  - standard buyer blocked
  - VIP buyer allowed
  - lot with and without visible pre-bids
- Edge cases:
  - Buy Now unavailable once auction is live or started
  - missing Buy Now price
  - no deposit lock available
  - VIP access restriction
  - auction version conflict
- Importance: `10`

### BUY-16 Bid history and live-room consistency
- Main flow: buyer sees lot detail bid history, live room feed, and current price aligned after successful bids.
- Variations:
  - snapshot-only load
  - websocket updates received
  - optimistic own bid replaced by server-confirmed bid
- Edge cases:
  - polling on bid panel and websocket snapshot should not drift
  - transient realtime error should not corrupt displayed price
- Importance: `8`

## 6. Buyer Wallet, Invoices, And Payments

### BUY-17 Wallet overview and withdrawal eligibility
- Main flow: buyer opens `/wallet`, sees available, locked, pending withdrawal amounts, ledger, and eligibility checks.
- Variations:
  - eligible to withdraw
  - active locks prevent withdrawal
  - outstanding invoices prevent withdrawal
  - compliance hold prevents withdrawal
  - no wallet activity
- Edge cases:
  - wallet auto-creation path for existing user without wallet
  - wallet user missing returns `404`
  - pending-withdrawal amount derived from requested vs approved ledger records
- Importance: `9`

### BUY-18 Deposit top-up
- Main flow: buyer adds funds from wallet modal, request is processed, ledger entry is written, and wallet refreshes.
- Variations:
  - `/wallet/topup`
  - `/wallet/deposit`
  - quick amounts vs custom amount
  - Stripe configured vs mock response when Stripe not configured
- Edge cases:
  - missing auth
  - KYC pending
  - account pending approval
  - zero or negative amount
  - missing idempotency key for direct deposit endpoint
  - duplicate idempotency key replays cached response
- Importance: `10`

### BUY-19 Withdrawal request
- Main flow: eligible buyer submits withdrawal amount up to available balance, wallet balance is reduced, and withdrawal ledger entry is created.
- Variations:
  - full available balance
  - partial withdrawal
  - withdrawal after eligibility check passes
- Edge cases:
  - missing auth
  - amount zero
  - amount above available balance
  - UI eligibility says no because of active locks, invoices, or compliance status
  - warning about 3-5 business day processing remains accurate with backend flow
- Importance: `9`

### BUY-20 Invoice list and invoice detail
- Main flow: buyer opens `/invoices`, sees outstanding or paid invoices, opens `/invoices/[id]`, reviews breakdown, and starts payment.
- Variations:
  - no invoices
  - all paid
  - pending invoice
  - overdue or defaulted invoice
  - invoice detail 404
- Edge cases:
  - invoice tone determined by status and due date
  - printed PDF action should not break on paid vs unpaid states
- Importance: `9`

### BUY-21 Payment intent creation and pay-now flow
- Main flow: buyer pays invoice from `/invoices/[id]` or finance API, idempotent payment intent is created, and Stripe client secret or mock intent is returned.
- Variations:
  - generated idempotency key from frontend
  - explicit idempotency key through payments API
  - mock payment intent when Stripe key is absent
- Edge cases:
  - missing auth
  - invoice not found
  - missing `idempotency-key` header
  - invoice not in `ISSUED` status
  - buyer can pay only own company invoice; admin may access more broadly
- Importance: `10`

### BUY-22 Stripe webhook processing
- Main flow: Stripe webhook verifies signature, deduplicates by Stripe event id, and moves payment state safely.
- Variations:
  - valid `payment_intent.succeeded`
  - duplicate webhook replay
  - invalid signature
- Edge cases:
  - webhook must be replay-safe
  - no duplicate payment posting
  - invoice/payment status should not transition illegally
- Importance: `10`

### BUY-23 Payment deadline default path
- Main flow: overdue `PAYMENT_PENDING` winner defaults once, invoice/deadline update, deposit burns once, and wallet never goes negative.
- Variations:
  - unpaid overdue invoice defaults
  - already paid invoice safely skipped
  - rerun is idempotent
- Edge cases:
  - insufficient locked balance must fail transactionally
  - default path must not double-burn on rerun
  - audit and counters should still reflect one default
- Importance: `10`

### BUY-24 Losing deposit release path
- Main flow: when an auction closes with a winner or Buy Now, losing bidder deposit locks are released and winner lock remains until payment outcome.
- Variations:
  - no-winner close releases all locks
  - winner close releases only losing locks
  - Buy Now triggers non-winner release immediately
- Edge cases:
  - release must not touch winner lock
  - concurrent release attempts keep wallet non-negative
- Importance: `10`

## 7. Seller Operations

### SEL-01 Seller dashboard and account-state banner
- Main flow: seller lands on `/seller/dashboard`, sees metrics and recent auctions.
- Variations:
  - active company
  - pending approval company banner
  - inactive company banner
- Edge cases:
  - empty recent auctions list
  - pending seller can access workspace but should not be able to publish buyer-facing changes
- Importance: `6`

### SEL-02 Create vehicle plus draft auction
- Main flow: seller uses `/seller/vehicles/new`, uploads media, submits vehicle form, backend creates vehicle and draft auction in one transaction, and redirects to auction or vehicle detail.
- Variations:
  - valid full submission with inspection date
  - partial setup redirect with `setup=partial`
  - NHTSA model lookup path for non-UAE brands
  - UAE brand/model datalist path
- Edge cases:
  - minimum 10 photos required
  - both Mulkiya sides required
  - photo and Mulkiya file type/size validation
  - inspection date must be between tomorrow and 90 days
  - Buy Now must be at least AED 500 and in AED 500 increments
  - VIN uniqueness conflict
  - unsaved changes navigation guard on cancel/leave
- Importance: `9`

### SEL-03 Seller media upload and retrieval APIs
- Main flow: seller uploads vehicle media through `/api/seller/vehicles/upload-photos`, receives stored media URLs, and those URLs are later served back through media route.
- Variations:
  - JPEG/PNG photos
  - PDF Mulkiya
  - multiple photos
- Edge cases:
  - not multipart request
  - unauthorized token
  - invalid path segments for media fetch
  - missing media file returns `404`
- Importance: `8`

### SEL-04 Seller vehicle list and search
- Main flow: seller opens `/seller/vehicles`, searches, filters by status, sorts, and opens vehicle details.
- Variations:
  - no vehicles
  - multiple statuses across draft, scheduled, live, ended
  - search by make, model, or VIN
- Edge cases:
  - filter is based on latest linked auction state, not vehicle entity alone
- Importance: `5`

### SEL-05 Seller vehicle detail and edit
- Main flow: seller opens `/seller/vehicles/[vehicleId]`, reviews specs and linked auction, opens edit modal, and saves changes.
- Variations:
  - edit while linked auction is `DRAFT`
  - read-only path while non-draft
  - success banner on newly created vehicle
- Edge cases:
  - vehicle not found or outside seller scope
  - vehicle edit locked once linked auction leaves `DRAFT`
  - VIN uniqueness conflict on update
- Importance: `8`

### SEL-06 Seller deletes draft vehicle
- Main flow: seller deletes a vehicle when all linked auctions are still `DRAFT`; vehicle and draft auctions are removed together.
- Variations:
  - confirm delete and redirect back to list
- Edge cases:
  - vehicle not found
  - any non-draft linked auction blocks delete with `409`
- Importance: `8`

### SEL-07 Seller auctions list
- Main flow: seller opens `/seller/auctions`, filters, sorts, and sees action buttons by state.
- Variations:
  - no auctions
  - draft, scheduled, live, ended states
  - search by vehicle or VIN
- Edge cases:
  - busy action state while update is in flight
- Importance: `5`

### SEL-08 Create standalone seller auction draft
- Main flow: seller creates an auction draft for an existing vehicle through API-backed auction create flow.
- Variations:
  - custom window and increment
  - vehicle exists and belongs to seller
- Edge cases:
  - missing vehicleId
  - vehicle not found
  - end time before start time
  - vehicle already associated with another seller
- Importance: `7`

### SEL-09 Seller auction detail and draft update
- Main flow: seller opens `/seller/auctions/[auctionId]`, sees countdown, KPIs, bid ladder, timeline, and can edit draft window or Buy Now.
- Variations:
  - draft auction editable
  - scheduled/live auction refresh polling only
  - success banners from redirected creation flow
- Edge cases:
  - auction not found or outside scope
  - Buy Now increment validation
  - invalid date window
  - refresh loop should not overwrite in-progress local edits unexpectedly
- Importance: `7`

### SEL-10 Seller cancel auction and publish restriction
- Main flow: seller can cancel allowed auctions, but direct publish attempt is blocked and requires admin approval.
- Variations:
  - cancel from `DRAFT`
  - cancel from `SCHEDULED`
  - cancel from `LIVE` or `EXTENDED`
- Edge cases:
  - invalid-state cancel rejected
  - seller publish action always returns `ADMIN_APPROVAL_REQUIRED`
- Importance: `9`

### SEL-11 Company settings
- Main flow: seller updates `/seller/settings/company` profile and optional logo, then saves successfully.
- Variations:
  - no logo
  - base64 logo preview path
  - different operating regions
- Edge cases:
  - missing required company fields
  - load failure vs save failure states
- Importance: `4`

### SEL-12 Seller documents
- Main flow: seller uploads trade license and supporting docs through `/seller/settings/documents` and sees status updates.
- Variations:
  - required trade license
  - optional VAT certificate
  - optional commercial registration
- Edge cases:
  - upload failure
  - existing document replaced or reloaded cleanly
- Importance: `5`

### SEL-13 Seller team management
- Main flow: seller manages `/seller/settings/team`, invites a member, changes role, and revokes access.
- Variations:
  - invite owner/admin/viewer
  - revoke after confirmation
  - empty team state
- Edge cases:
  - invite saved but list reload fails
  - role update failure
  - revoke cancellation
- Importance: `5`

### SEL-14 Seller notification preferences
- Main flow: seller changes email and SMS preferences and saves them.
- Variations:
  - all defaults
  - mixed email and SMS toggles
- Edge cases:
  - load failure
  - save failure
- Importance: `4`

## 8. Admin Operations

### ADM-01 Admin auth and shell access
- Main flow: admin logs in, reaches `/admin`, and is redirected to `/admin/companies`.
- Variations:
  - valid admin token
  - seller or buyer token rejected
  - no token redirected to login
- Edge cases:
  - admin pages depend on server-side `/me`, so stale token handling matters
- Importance: `6`

### ADM-02 Company review queue
- Main flow: admin opens `/admin/companies`, reviews pending seller companies, opens detail modal, and approves or rejects.
- Variations:
  - pending tab
  - all tab
  - approve company
  - reject company
- Edge cases:
  - buyer-only pending companies excluded from seller queue
  - company already updated or deleted returns refreshable error
  - approval activates linked seller users
  - rejection rejects linked seller-manager users
- Importance: `9`

### ADM-03 Buyer review queue and account actions
- Main flow: admin opens `/admin/buyers`, reviews pending buyers, opens detail modal, approves or rejects, and can approve KYC.
- Variations:
  - pending approval
  - pending deposit/KYC
  - all buyers
  - approve buyer
  - reject buyer
  - approve KYC
  - block user
  - unblock user
- Edge cases:
  - non-buyer target rejected
  - user not found
  - block/unblock require reason payload
  - unblock on non-blocked user rejected
  - company status syncs with buyer approval/rejection
- Importance: `9`

### ADM-04 Vehicle review and scheduling approval
- Main flow: admin opens `/admin/vehicles`, reviews vehicle detail, sets market price, assigns event, and approves or rejects.
- Variations:
  - pending tab
  - all vehicles
  - approve draft vehicle
  - reject vehicle
  - edit market price
  - assign event
  - unassign event
- Edge cases:
  - approving vehicle moves auction from `DRAFT` to `SCHEDULED`
  - VIP early-access metadata must be written on approval
  - dark-launch applicability failing should fail closed
  - already-approved inventory should not reset approval metadata
  - optional DB columns missing still falls back to base query
- Importance: `10`

### ADM-05 Event creation
- Main flow: admin creates a new event from `/admin/events/new`, backend creates event metadata and sends announcement email.
- Variations:
  - title/date/time/description provided
  - title with empty description
- Edge cases:
  - invalid date or missing start time
  - no base vehicle available for seed event creation
  - created event should appear in event list and vehicle assignment dropdown
- Importance: `7`

### ADM-06 Event list and detail management
- Main flow: admin opens `/admin/events`, drills into `/admin/events/[id]`, reorders lots, adds approved unassigned vehicles, and removes vehicles.
- Variations:
  - draft, scheduled, live, ended event list statuses
  - event detail with existing lots
  - event detail with no lots
  - add candidate vehicle
  - reorder existing lots
  - remove vehicle from event
- Edge cases:
  - event not found
  - assignment/unassignment backend failure
  - order transition persists without changing main event state
- Importance: `8`

### ADM-07 Draft event deletion
- Main flow: admin deletes a draft event from the events list.
- Variations:
  - delete allowed for `DRAFT`
- Edge cases:
  - non-draft delete blocked
  - delete removes all draft rows in the shared event window
- Importance: `6`

### ADM-08 Pending withdrawal review
- Main flow: admin lists pending deposit returns and approves the oldest open request for a buyer.
- Variations:
  - pending returns list empty
  - multiple open requests
  - approve return with reason
- Edge cases:
  - no pending request
  - target user not found or not a buyer
  - wallet missing
- Importance: `8`

### ADM-09 Manual refund and manual burn
- Main flow: admin manually refunds funds back to a wallet or burns an active deposit lock for a default/refusal path.
- Variations:
  - admin refund with reason
  - admin burn tied to auctionId
- Edge cases:
  - buyer not found
  - wallet not found
  - active deposit lock missing for burn
  - refund/burn audit trail and resulting balances must match ledger
- Importance: `8`

## 9. System And Lifecycle Flows

### SYS-01 Scheduler starts due auctions
- Main flow: lifecycle scheduler moves `SCHEDULED -> LIVE` once start time is reached and writes one transition row.
- Variations:
  - due auction transitions
  - future scheduled auction remains unchanged
  - already-live auction remains unchanged
- Edge cases:
  - repeated run is effectively idempotent for already-transitioned rows
  - batch size boundaries
- Importance: `9`

### SYS-02 Scheduler closes due auctions
- Main flow: lifecycle scheduler moves expired `LIVE -> ENDED`, stamps `closed_at`, and writes one transition row.
- Variations:
  - due live auction
  - future live auction not closed
  - rerun after close does nothing
- Edge cases:
  - exact boundary around `ends_at`
  - batch processing order and `SKIP LOCKED`
- Importance: `9`

### SYS-03 Backend close job winner/no-winner branch
- Main flow: backend close process transitions expired live auctions to `PAYMENT_PENDING` if a winner exists, else `ENDED`, then issues invoice or releases all deposit locks accordingly.
- Variations:
  - winner exists
  - no winner exists
- Edge cases:
  - invoice created exactly once
  - losing deposits released
  - winner company set correctly
- Importance: `10`

### SYS-04 Winner finalization
- Main flow: winner finalization creates invoice and payment deadline once for an ended auction with winner.
- Variations:
  - first call creates invoice and deadline
  - repeated call returns same economic result without duplication
- Edge cases:
  - closed auction missing winner should fail safely
  - invoice totals and due dates must remain deterministic
- Importance: `10`

### SYS-05 Payment deadline enforcement
- Main flow: overdue payment deadlines are processed in batches; defaulted auctions burn deposit once, paid auctions are skipped, noop rows are safe.
- Variations:
  - `defaulted`
  - `paid`
  - `noop`
- Edge cases:
  - rerun is idempotent
  - wallet locked balance insufficiency is transactional
  - guardrail counters increment correctly
- Importance: `10`

### SYS-06 Deposit lock lifecycle
- Main flow: deposit lock is acquired once per wallet/auction, can later be released or burned, and wallet balances stay non-negative under concurrency.
- Variations:
  - first acquire
  - duplicate acquire returns existing lock
  - release active lock
  - burn active lock
- Edge cases:
  - invalid lifecycle transition `RELEASED -> BURNED`
  - partial unique constraint prevents duplicate active locks
  - concurrent acquire/release attempts do not double-apply
- Importance: `10`

### SYS-07 Realtime publish path
- Main flow: successful bid or Buy Now publishes updated auction snapshot to websocket subscribers through Redis when available.
- Variations:
  - Redis available
  - Redis unavailable and system degrades without crashing
- Edge cases:
  - disconnected sockets get cleaned up
  - best-effort publish failure should not fail the bid itself
- Importance: `7`

## 10. Read-Model And Alternate UX Flows

### ALT-01 `/finance` payment-pending portal
- Main flow: buyer opens `/finance`, read-model invoices load directly from Prisma read model, and account banner reflects buyer/company status.
- Variations:
  - invoices present
  - invoices absent
  - locale-aware copy
- Edge cases:
  - route uses temporary read model, not the same API path as `/invoices`
- Importance: `3`

### ALT-02 `/finance/invoices/[invoiceId]`
- Main flow: buyer opens alternate invoice detail route backed by read model.
- Variations:
  - invoice exists
  - invoice missing returns not found
- Edge cases:
  - route duplicates core invoice detail surface with different data source
- Importance: `3`

## Release Recommendations

### Must-pass before rollout
- `BUY-10` through `BUY-15`
- `BUY-18` through `BUY-23`
- `SEL-02`, `SEL-05`, `SEL-10`
- `ADM-02` through `ADM-04`
- `SYS-03` through `SYS-06`

### Strongly recommended full regression slice
- all flows scored `8+`

### Lower-priority or cleanup candidates
- `BUY-08`, `BUY-05`, `ALT-01`, `ALT-02`
- These should either be tested lightly as legacy paths or explicitly removed from release scope.

## Biggest Product Risks Found During Review

1. Login does not itself block pending buyer or seller accounts; action-level gates do. This is intentional in current code, but QA should test both allowed read-access and blocked money-making actions.
2. There are parallel buyer payment surfaces: `/invoices` is the primary API-backed flow, while `/finance` and `/finance/invoices/[invoiceId]` are read-model alternatives still present in the repo.
3. `/buyer/wishlist` is a legacy client-only page with a different payload shape from `/watchlist`.
4. Seller inventory approval is the real publish gate. Seller draft auctions can be edited or canceled, but they cannot self-publish.
5. Financial correctness depends on idempotency and scheduler paths, not just UI clicks. The highest-value regressions are in bid replay, payment replay, close/default idempotency, and deposit-lock accounting.
