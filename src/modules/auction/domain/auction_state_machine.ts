import { DomainConflictError } from "../../../lib/domain_errors";

export const AUCTION_STATE_TRANSITION_CONFLICT_CODE = "AUCTION_INVALID_TRANSITION";

export const auctionManagedStates = [
  "DRAFT",
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "PAYMENT_PENDING",
  "PAID",
  "DEFAULTED",
] as const;

export type AuctionManagedState = (typeof auctionManagedStates)[number];

const allowedTransitions: Record<AuctionManagedState, ReadonlySet<AuctionManagedState>> = {
  DRAFT: new Set(["SCHEDULED"]),
  SCHEDULED: new Set(["LIVE"]),
  LIVE: new Set(["ENDED"]),
  ENDED: new Set(["PAYMENT_PENDING"]),
  PAYMENT_PENDING: new Set(["PAID", "DEFAULTED"]),
  PAID: new Set(),
  DEFAULTED: new Set(),
};

export function normalizeAuctionState(state: string): AuctionManagedState {
  if (state === "CLOSED") {
    return "ENDED";
  }

  if ((auctionManagedStates as readonly string[]).includes(state)) {
    return state as AuctionManagedState;
  }

  throw new DomainConflictError(
    AUCTION_STATE_TRANSITION_CONFLICT_CODE,
    `Unsupported auction state: ${state}`,
  );
}

export function canTransitionAuctionState(
  fromState: AuctionManagedState,
  toState: AuctionManagedState,
): boolean {
  return allowedTransitions[fromState].has(toState);
}

export function assertAuctionTransitionAllowed(
  fromState: AuctionManagedState,
  toState: AuctionManagedState,
): void {
  if (!canTransitionAuctionState(fromState, toState)) {
    throw new DomainConflictError(
      AUCTION_STATE_TRANSITION_CONFLICT_CODE,
      `Invalid auction transition: ${fromState} -> ${toState}`,
    );
  }
}

export function persistenceAuctionState(state: AuctionManagedState): string {
  return state;
}
