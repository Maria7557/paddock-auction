export const billingErrorCodes = {
  missingIdempotencyKey: "MISSING_IDEMPOTENCY_KEY",
  invalidPaymentIntentRequest: "INVALID_PAYMENT_INTENT_REQUEST",
  invoiceNotFound: "INVOICE_NOT_FOUND",
  invoiceNotIssued: "INVOICE_NOT_ISSUED",
  auctionWinnerMismatch: "AUCTION_WINNER_MISMATCH",
  auctionNotReadyForFinalization: "AUCTION_NOT_READY_FOR_WINNER_FINALIZATION",
  paymentIntentInProgress: "PAYMENT_INTENT_IN_PROGRESS",
  stripePaymentIntentFailed: "STRIPE_PAYMENT_INTENT_FAILED",
  invalidStripeSignature: "INVALID_STRIPE_SIGNATURE",
  invalidStripeEventPayload: "INVALID_STRIPE_EVENT_PAYLOAD",
  internalError: "INTERNAL_ERROR",
} as const;

export type BillingErrorCode = (typeof billingErrorCodes)[keyof typeof billingErrorCodes];
