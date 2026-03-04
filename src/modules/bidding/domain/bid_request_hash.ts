import { createHash } from "node:crypto";

export type CanonicalBidPayload = {
  auction_id: string;
  company_id: string;
  user_id: string;
  amount: string;
};

export type BidHashInput = {
  auctionId: string;
  companyId: string;
  userId: string;
  amount: number;
};

function normalizeMoneyAmount(amount: number): string {
  const normalized = Math.round(amount * 100) / 100;
  return normalized.toFixed(2);
}

export function canonicalizeBidPayload(input: BidHashInput): CanonicalBidPayload {
  return {
    auction_id: input.auctionId,
    company_id: input.companyId,
    user_id: input.userId,
    amount: normalizeMoneyAmount(input.amount),
  };
}

export function createBidRequestHash(input: BidHashInput): string {
  const canonicalPayload = canonicalizeBidPayload(input);
  const canonicalJson = JSON.stringify(canonicalPayload);

  return createHash("sha256").update(canonicalJson).digest("hex");
}
