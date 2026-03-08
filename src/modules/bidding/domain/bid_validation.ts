export function normalizeBidAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function calculateMinimumAcceptedBidAmount(
  currentBidAmount: number,
  bidStepAmount: number,
): number {
  return normalizeBidAmount(currentBidAmount + bidStepAmount);
}

export function isBidAmountValid(
  bidAmount: number,
  currentBidAmount: number,
  bidStepAmount: number,
): boolean {
  return normalizeBidAmount(bidAmount) >= calculateMinimumAcceptedBidAmount(currentBidAmount, bidStepAmount);
}
