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

export const auctionLifecycleStates = [
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "PAYMENT_PENDING",
  "DEFAULTED",
] as const;

export type AuctionLifecycleState = (typeof auctionLifecycleStates)[number];

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

function assertLifecycleState(state: AuctionLifecycleState): void {
  if ((auctionLifecycleStates as readonly string[]).includes(state)) {
    return;
  }

  throw new DomainConflictError(
    AUCTION_STATE_TRANSITION_CONFLICT_CODE,
    `Unsupported auction lifecycle state: ${state}`,
  );
}

export function startAuction(currentState: AuctionLifecycleState): "LIVE" {
  assertLifecycleState(currentState);
  assertAuctionTransitionAllowed(currentState, "LIVE");
  return "LIVE";
}

export function closeAuction(currentState: AuctionLifecycleState): "ENDED" {
  assertLifecycleState(currentState);
  assertAuctionTransitionAllowed(currentState, "ENDED");
  return "ENDED";
}

export function markPaymentPending(currentState: AuctionLifecycleState): "PAYMENT_PENDING" {
  assertLifecycleState(currentState);
  assertAuctionTransitionAllowed(currentState, "PAYMENT_PENDING");
  return "PAYMENT_PENDING";
}

export function markDefaulted(currentState: AuctionLifecycleState): "DEFAULTED" {
  assertLifecycleState(currentState);
  assertAuctionTransitionAllowed(currentState, "DEFAULTED");
  return "DEFAULTED";
}

export function persistenceAuctionState(state: AuctionManagedState): string {
  return state;
}
