export const bidErrorCodes = {
  missingIdempotencyKey: "MISSING_IDEMPOTENCY_KEY",
  invalidPayload: "INVALID_BID_PAYLOAD",
  biddingDisabled: "BIDDING_DISABLED",
  bidRateLimited: "BID_RATE_LIMITED",
  idempotencyConflict: "IDEMPOTENCY_CONFLICT",
  idempotencyInProgress: "IDEMPOTENCY_IN_PROGRESS",
  auctionNotLive: "AUCTION_NOT_LIVE",
  bidAmountTooLow: "BID_AMOUNT_TOO_LOW",
  noDepositNoBid: "NO_DEPOSIT_NO_BID",
  depositRequired: "DEPOSIT_REQUIRED",
  bidContentionConflict: "BID_CONTENTION_CONFLICT",
  bidFloodProtected: "BID_FLOOD_PROTECTED",
  internalError: "INTERNAL_ERROR",
} as const;

export type BidErrorCode = (typeof bidErrorCodes)[keyof typeof bidErrorCodes];

export const expectedBidContentionSqlStates = new Set(["55P03", "40P01", "40001"]);

export function isExpectedBidContentionSqlState(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }

  return expectedBidContentionSqlStates.has(code);
}
