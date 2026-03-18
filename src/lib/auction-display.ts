export function normalizeAuctionState(state: string | null | undefined): string {
  return state?.trim().toUpperCase() ?? "";
}

export function isLiveAuctionState(state: string | null | undefined): boolean {
  const normalized = normalizeAuctionState(state);
  return normalized === "LIVE" || normalized === "EXTENDED";
}

export function isScheduledAuctionState(state: string | null | undefined): boolean {
  return normalizeAuctionState(state) === "SCHEDULED";
}

export function isScheduledWithoutBids(
  state: string | null | undefined,
  currentBidAed: number | null | undefined,
): boolean {
  return isScheduledAuctionState(state) && Number(currentBidAed ?? 0) <= 0;
}
