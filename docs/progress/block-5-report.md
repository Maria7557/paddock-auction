# Block 5 Report - Invoice + Payment Intent + Stripe Webhook Idempotent Processing

## Scope Completed
Implemented Block 5 only:
1. Winner finalization command now creates invoice and payment deadline exactly once and transitions auction to `PAYMENT_PENDING`.
2. Added payment intent endpoint `POST /api/payments/invoices/:invoiceId/intent` with required `Idempotency-Key` and DB-backed idempotency by `(invoice_id, idempotency_key)`.
3. Added Stripe webhook endpoint `POST /api/stripe/webhook` with signature verification, dedupe by unique `stripe_event_id`, race guard on invoice status, and atomic success-path state mutations.
4. Added required integration tests for invoice/deadline singleton creation, payment intent idempotency, webhook duplicate no-op, out-of-order no-op, and one-time success application.

## Files Changed
- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/20260301233000_block5_billing_webhook_contract/migration.sql`
- `src/lib/env.ts`
- `app/api/payments/invoices/[invoiceId]/intent/route.ts`
- `app/api/stripe/webhook/route.ts`
- `src/modules/billing/domain/billing_error_codes.ts`
- `src/modules/billing/domain/billing_domain_errors.ts`
- `src/modules/billing/domain/stripe_signature.ts`
- `src/modules/billing/domain/stripe_signature.test.ts`
- `src/modules/billing/infrastructure/stripe_payment_intent_gateway.ts`
- `src/modules/billing/infrastructure/winner_finalization_sql_repository.ts`
- `src/modules/billing/infrastructure/payment_intent_sql_repository.ts`
- `src/modules/billing/infrastructure/stripe_webhook_sql_repository.ts`
- `src/modules/billing/application/winner_finalization_service.ts`
- `src/modules/billing/application/payment_intent_service.ts`
- `src/modules/billing/application/stripe_webhook_service.ts`
- `src/modules/billing/transport/post_payment_intent_handler.ts`
- `src/modules/billing/transport/post_stripe_webhook_handler.ts`
- `tests/integration/block2_database_contract.test.ts`
- `tests/integration/block5_billing_payments_webhook.test.ts`
- `docs/progress/block-5-report.md`

## Transaction Boundaries

### Winner finalization (`finalizeAuctionWinner`)
Single transaction includes:
1. Lock auction row (`FOR UPDATE`).
2. Validate state (`ENDED` or existing `PAYMENT_PENDING`) and winner consistency.
3. Create/find invoice (`invoices`) exactly once.
4. Create/find active payment deadline (`payment_deadlines`) exactly once.
5. If state is `ENDED`, atomically:
   - update auction to `PAYMENT_PENDING`
   - insert one `auction_state_transitions` row (`ENDED -> PAYMENT_PENDING`).

### Payment intent (`createInvoicePaymentIntent`)
Two-phase flow (no external HTTP inside DB transaction):
1. DB transaction: lock invoice, enforce `ISSUED`, create/find payment row by `(invoice_id, idempotency_key)`.
2. External Stripe API call (idempotency key forwarded).
3. DB transaction: attach `stripe_payment_intent_id` to payment row if not already set.

### Stripe webhook (`processStripeWebhook`)
Single transaction for dedupe + success-path mutation:
1. Insert into `payment_webhook_events` with unique `stripe_event_id` (`ON CONFLICT DO NOTHING`).
2. Duplicate insert => immediate safe no-op.
3. For success events, lock invoice row (`FOR UPDATE`) and guard:
   - if invoice status != `ISSUED` => safe no-op.
4. On valid path, atomically:
   - update `payments` -> `SUCCEEDED`
   - update `invoices` -> `PAID`
   - update `payment_deadlines` -> `PAID`
   - release winner deposit lock (`deposit_wallets`, `deposit_locks`)
   - transition auction `PAYMENT_PENDING -> PAID` with transition history row
   - insert `financial_events` rows for `PAYMENT_SUCCEEDED` and `DEPOSIT_RELEASE`.

## Race Guard + Dedupe Notes
- Webhook dedupe is authoritative on `payment_webhook_events.stripe_event_id` unique key.
- Success-path race guard locks invoice and no-ops when status is not `ISSUED`, preventing duplicate/late success mutation.
- Duplicate webhook metric `stripe_webhook_dedupe_total` increments on dedupe no-op.

## Tests Executed and Results
- `npm run lint` - pass
- `npm run typecheck` - pass
- `npm run test:unit` - pass (14 tests)
- `npm run test:integration` - pass (25 tests)
- `npm run test:e2e` - pass (2 tests)

Block-5 integration tests added and passing:
- `invoice and payment deadline are created once during winner finalization`
- `payment intent endpoint enforces idempotency by invoice and key`
- `duplicate webhook delivery is a safe no-op`
- `out-of-order success webhook is no-op when invoice is not ISSUED`
- `successful webhook applies payment, deadline, auction and deposit mutations exactly once`
