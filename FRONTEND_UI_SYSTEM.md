# FRONTEND UI System

This document describes the current frontend UI system as implemented in the codebase.
Scope is descriptive only (no redesign proposals in implementation terms).

## Section 1 — Project Overview

### Product Purpose
The frontend represents a B2B auction marketplace focused on fleet vehicles in the UAE.

Current product framing in UI copy and flows:
- Fleet vehicle auctions
- Weekly live auction positioning
- Deposit-gated bidding
- Payment deadline enforcement after winning

### Core UX Model
Current UX flow implemented across pages:
- Browse inventory (`/`, `/auctions`)
- Select lot (`/auctions/[auctionId]`)
- Participate in auction (live lot with countdown + bid module)
- Bid (idempotent bid submission)
- Win (state inferred from bid outcome/invoice issuance)
- Pay (`/finance`, `/finance/invoices/[invoiceId]`, `/invoices`)

---

## Section 2 — Current Design System

### Typography
Fonts (from `app/layout.tsx` and CSS tokens):
- Primary UI font: `Space Grotesk` (`--font-space-grotesk`)
- Monospace/meta font: `IBM Plex Mono` (`--font-ibm-plex-mono`)

Type scale currently used (selected patterns):
- Hero H1 (home CSS module): `clamp(46px, 5vw, 74px)`
- Hero subtext (home CSS module): `clamp(18px, 1.35vw, 26px)`
- Section H1 (`.section-heading h1`): `clamp(34px, 3.7vw, 42px)`
- Section H2 (`.section-heading h2`): `clamp(24px, 2.3vw, 28px)`
- Card titles (`.lot-content h3`, `.bid-watch-card h3`): `20px`
- Body/support text: mostly `14px–17px`
- Meta labels (`.hero-kicker`, `.card-eyebrow`, `.meta`): `12px` uppercase/mono where applicable

### Colors
From `:root` in `app/globals.css`:

Core palette:
- Primary text: `--ink-primary: #1f2933`
- Secondary text: `--ink-secondary: #556270`
- Muted text: `--ink-muted: #7b8794`

Backgrounds:
- Page: `--bg-page: #f8f9fb`
- Card/surface: `--bg-card: #ffffff`
- Subtle surface: `--bg-subtle: #f3f5f7`

Lines/Borders:
- Soft border: `--line-soft: #e5e9ef`
- Strong border: `--line-strong: #d9dee6`

Semantic colors:
- Primary/accent green: `--green-600: #116a43`, hover `--green-700: #0d5a39`, tint `--green-100: #e8f4ee`
- Danger: `--red-600: #b43d36`, tint `--red-100: #fae8e7`
- Warning: `--amber-600: #9b6914`, tint `--amber-100: #f6ead4`

Additional hardcoded neutrals are used in some places (for example `#374151`, `#607080`, `#eceff3`).

### Spacing System
Global spacing tokens:
- `--space-1..7 = 8, 12, 16, 24, 32, 40, 56`

Dominant layout spacing:
- Shell top/bottom padding: `24px / 64px`
- Main vertical section gap: `56px` (`.market-main`)
- Section block padding: `32px` (`.section-block`), `24px 28px` compact variant
- Grid gaps commonly: `10px`, `12px`, `14px`, `16px`, `24px`, `28px`

Containers and widths:
- Main container: `.market-shell { width: min(1280px, calc(100% - 48px)) }`
- Mobile reduction to `calc(100% - 24px)` and `calc(100% - 16px)` at breakpoints

### Component Visual Patterns
- Border: mostly `1px solid var(--line-soft)`
- Radius tokens:
- `--radius-card: 16px`
- `--radius-control: 12px`
- `--radius-pill: 999px`
- Shadow:
- `--shadow-soft: 0 6px 22px rgba(15,23,42,0.06)` (default cards/surfaces)
- `--shadow-lift: 0 12px 28px rgba(15,23,42,0.08)` (sticky bid module)

Dominant surface style:
- White card background
- Soft border
- Soft shadow
- 12–16px corner radii

---

## Section 3 — Core UI Components

Below are current reusable components and patterns in code.

### Button
Name:
- Global class-based component pattern (`.button` + modifier)

Purpose:
- Unified action control style across flows

Where used:
- Header actions, hero CTAs, lot actions, auth forms, bidding, finance actions, filters

States:
- Variants: `button-primary`, `button-secondary`, `button-ghost`
- Interactive: hover states per variant
- Disabled: `opacity: 0.45`, `cursor: not-allowed`

Props:
- Not a TS component; native `<button>`/`<a>` + class composition

### Input
Name:
- Global element style (`input`)

Purpose:
- Form entry for auth, filters, bids, finance idempotency keys

Where used:
- Login/register, auction filters/sidebar, sticky bid module, finance flows

States:
- Focus-visible outline (`rgba(17,106,67,0.25)`)

Props:
- Native input props per usage

### Select
Name:
- Global element style (`select`)

Purpose:
- Filtering, language/currency utility choices

Where used:
- Auction filters/sidebar, top utility bar selectors

States:
- Focus-visible outline same as input

Props:
- Native select props/options per usage

### Card
Name:
- Pattern family (`.section-block`, `.surface-panel`, `.lot-card`, `.metric-tile`, `.bid-watch-card`, `.invoice-card`, `.finance-card`)

Purpose:
- Encapsulated content blocks with consistent border/radius/shadow

Where used:
- All main pages

States:
- Mostly static visual state
- Variant by class (compact/standard)

Props:
- Class/pattern-based, not single TS card primitive

### Badge
Name:
- `AuctionStatusBadge`

Purpose:
- Auction status labeling (`LIVE`, `SCHEDULED`, `PAYMENT PENDING`, `DEFAULTED`, `ENDED`)

Where used:
- Lot cards, bid/watch cards, lot detail top

States:
- Style variants by status class: `.status-live`, `.status-scheduled`, `.status-payment_pending`, `.status-defaulted`, `.status-ended`

Props (from code):
- `status: AuctionStatus`

### PriceDisplay
Name:
- No dedicated TS component exists

Purpose:
- Currency display is implemented as a pattern using `formatAed(...)`

Where used:
- Lot cards, lot detail highlights, bid module KPIs, wallet, invoices, finance cards

States:
- Visual hierarchy varies by class:
- `.lot-price-value` (largest in lot card)
- `.lot-step-value`, `.lot-buy-now-value` styles exist in CSS but buy-now block is not rendered in current lot card JSX

Props:
- N/A (pattern only)

### CountdownTimer
Name:
- `LiveCountdown`

Purpose:
- Live ticking countdown to lot end/invoice due date

Where used:
- Lot cards, bid/watch cards, invoice cards, payment pending cards, invoice detail, sticky bid module

States:
- Running: `HHh MMm SSs`
- Overdue: switches to `overdueLabel` (default `Ended`)

Props:
- `targetIso: string`
- `prefix?: string`
- `overdueLabel?: string`
- `className?: string`

### BidHistory Table
Name:
- No table component for bids in active UI

Purpose:
- Bid history is shown as list-based UIs

Where used:
- `LiveBidHistory` (`.live-bid-list`)
- `AuctionDetailTabs` tab `BID_HISTORY` (`.bid-history-list`)

States:
- Empty fallback message in section header for no accepted bids
- Highlight for own bids: `.is-mine`

Props:
- `LiveBidHistory`: `auctionId`, `initialEntries`

### WalletBalance
Name:
- `WalletOverview`

Purpose:
- Show available/locked/pending balances, active locks, transactions

Where used:
- `/wallet`

States:
- Static summary cards
- `details` disclosure for transaction history

Props:
- `wallet: WalletReadModel`

### DepositStatus
Name:
- Deposit indicator block in `StickyBidModule`

Purpose:
- Show whether user can bid based on deposit readiness

Where used:
- Lot detail sidebar bid module

States:
- Ready: `.deposit-indicator.is-ready`
- Required: `.deposit-indicator.is-required` + wallet top-up link

Props:
- Through `StickyBidModule` props:
- `depositRequiredAed: number`
- `depositReady: boolean`

### Toast Notifications
Name:
- `InlineFeedback`, `ToastStack`

Purpose:
- Inline status messaging and stacked toast notifications for command outcomes

Where used:
- `InlineFeedback` in `FinanceTable` and `BidTicket`
- `ToastStack` in `BidTicket`
- Similar inline-note pattern used in `StickyBidModule`, finance views

States:
- Tones: `success`, `info`, `warning`, `error`

Props:
- `InlineFeedback`: `title`, `detail?`, `tone?`, `code?`
- `ToastStack`: `messages: ToastMessage[]`

### Modal
Name:
- Not present in current codebase

Purpose:
- N/A

Where used:
- No modal/dialog component or modal class patterns found

States:
- N/A

Props:
- N/A

---

## Section 4 — Page Structure

### Home Page (`/`)
Current sections:
- Hero surface
- Left: H1, subtext, feature bullets, 2 CTAs
- Right: framed hero image
- Bottom: 3 KPI metrics
- Upcoming Auctions section
- Heading + subtitle
- 3 lot cards from live inventory slice

Requested reference items vs current:
- Hero: present
- Upcoming auction: present (as `Upcoming Auctions` section)
- New lots: no separate standalone section; currently represented by upcoming lot cards
- Call to action: present in hero (`Browse Upcoming Auctions`, `Book Viewing`)

### Auctions Page (`/auctions`)
Structure:
- Compact intro section
- `AuctionFilterSidebar` layout:
- Filter sidebar (search, status, location, seller, min/max price, min year, max mileage, ending soon toggle, sort)
- Results grid of lot cards
- Mobile filter toggle for small screens

Includes required elements:
- Auction list: yes
- Date/countdown: via lot card countdown/date
- Status: via `AuctionStatusBadge`
- Navigation to lots: `Enter Lot` buttons

### Search Page
Current state:
- No standalone `/search` route exists
- Search behavior is integrated into `/auctions` filter sidebar (`Search` input + sorting/filters)

### Lot Detail Page (`/auctions/[auctionId]`)
Structure:
- Top block: lot number (kicker), title, meta line, status badge
- Main two-column layout:
- Left column:
- Image gallery (main + thumbs)
- Lot highlights (current bid, min next, step, auction end)
- Detail tabs (details/inspection/documents/seller/bid history)
- Live bid history list with polling
- Right column:
- Sticky bid module (price KPIs, countdown, deposit status, bid form)
- Seller trust panel
- Mobile sticky bid bar appears on small screens for live lots

Includes required elements:
- Image gallery: yes
- Vehicle specs: yes (tabs + highlights)
- Current bid: yes
- Bid button/form: yes
- Countdown: yes
- Bid history: yes

### How It Works Page
Current state:
- No standalone route exists
- Header contains nav link to `/#how-it-works`, but current homepage does not include a corresponding section id

### Login Page (`/login`)
Structure:
- Centered auth layout
- Surface panel
- Heading + support text
- Email/password fields
- Primary sign-in button
- Link to register page

### Additional Existing Pages
- `/register`: company onboarding form
- `/dashboard`: summary metrics + recent activity timeline
- `/my-bids`: bid watch cards in bid mode
- `/watchlist`: bid watch cards in watch mode
- `/wallet`: balance cards, active locks, transaction history
- `/finance`: payment pending cards with per-invoice idempotent payment actions
- `/invoices`: invoice card list view
- `/finance/invoices/[invoiceId]`: detailed invoice breakdown + payment action

---

## Section 5 — Auction UX States

### Auction-Level States
Implemented status model in UI read model:
- `SCHEDULED`: upcoming auction lot, no active bidding yet
- `LIVE`: active bidding with live countdown and bid actions
- `PAYMENT_PENDING`: auction completed, winner payment window active
- `ENDED`: closed lot state
- `DEFAULTED`: payment default state

### Lot States (Requested Mapping)
Requested states mapped to current implementation:
- Active: represented by `LIVE`
- Sold: inferred when lot reaches `PAYMENT_PENDING` and invoice is issued
- Unsold: no explicit dedicated lot status in current UI; `ENDED` does not explicitly distinguish sold vs unsold

### User States
Implemented/visible user states:
- Leading bid:
- `StickyBidModule` outcome `winning` and success note
- `My bids` card uses `isWinning` => `Winning` pill
- Outbid:
- `StickyBidModule` outcome `outbid`
- `My bids` card `isWinning=false` => `Outbid` pill
- Deposit required:
- `depositReady=false` shows red deposit indicator and wallet link
- Bid button disabled when deposit not ready in sticky module
- Auction won:
- No single explicit “You won” component label
- Inferred via invoice/payment-pending flows and invoice issuance states

---

## Section 6 — Mobile Behavior

Breakpoints used:
- `max-width: 1200px`
- `max-width: 980px`
- `max-width: 740px`

Current behavior:
- Header/navigation:
- Market header stacks into single-column row at `<=980px`
- Nav wraps; right actions reflow
- Top utility bar wraps at `<=980px`
- Cards and grids:
- `home-grid`/`listing-grid` from 3 columns to 2 (`<=1200`) to 1 (`<=740`)
- Dashboard/wallet/spec grids collapse progressively to single-column
- Auction list filters:
- At `<=980`, sidebar hidden by default and toggled with mobile filter button
- Lot detail:
- Detail two-column layout becomes single column at `<=980`
- Sticky desktop module becomes non-sticky on smaller screens
- Mobile bid bar:
- Hidden by default, shown at `<=740` for bid-capable lots
- Fixed to bottom; shell adds bottom padding to avoid overlap
- Homepage hero:
- Current homepage uses `app/page.module.css` responsive hero behavior (single-column at `<=980`, reduced image height)

---

## Section 7 — Layout System

### Global Layout Pattern
- Wrapper: `MarketShell`
- Container width: `min(1280px, calc(100% - 48px))`
- Vertical rhythm: `market-main` as stacked grid with `56px` gaps
- Header is sticky with blur background and soft border/shadow

### Structural Blocks
- Primary section container: `.section-block`
- Generic panel/surface: `.surface-panel`
- Listing layout: two-column (`sidebar + content`) using CSS grid
- Detail layout: two-column (`main + side`) using CSS grid

### Card Grids
- Home lots grid: 3 columns desktop
- Listing lots grid: 3 columns desktop
- Dashboard cards: 4 columns desktop
- Wallet balances: 3 columns desktop
- All collapse at defined breakpoints

### Page Spacing
- Shell top padding `24px`
- Main top offset after header via `.market-main`
- Section internal paddings mostly `20px–32px`
- Buttons and controls follow the same radius/control sizing system

---

## Section 8 — Improvement Notes (Style-Consistent Only)

These are low-risk consistency improvements based on current implementation, without changing visual direction.

1. Align navigation links with existing content structure.
- `How It Works` points to `/#how-it-works`, but current homepage has no matching target section.

2. Consolidate active vs legacy UI primitives.
- Several component files (`AppShell`, `AuctionCard`, `AuctionFilters`, `FinanceTable`, `BidTicket`, `MetricCard`, `BidLadder`, `StateBlocks`) exist but are not used by current routes.

3. Resolve style coverage gaps for legacy components if they remain in scope.
- Multiple legacy class names (for example `status-chip`, `finance-table`, `inline-feedback`, `toast-item`) have no matching CSS definitions in current global styles.

4. Standardize homepage style source.
- Homepage combines global hero classes and a page CSS module override; keeping one clearly canonical source per section would reduce drift.

5. Ensure brand naming consistency in metadata and UI labels.
- Layout metadata still uses “Paddock UAE Vehicle Auctions” while visible header brand is “FleetBid”.

6. Clarify sold/unsold semantics in lot status model.
- Current frontend does not expose a distinct “unsold” lot state; adding explicit mapping in read model would improve UX clarity without changing visual style.

