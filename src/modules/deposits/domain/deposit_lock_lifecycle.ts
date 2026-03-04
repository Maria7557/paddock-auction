import { DomainConflictError } from "../../../lib/domain_errors";

export const DEPOSIT_LOCK_LIFECYCLE_CONFLICT_CODE = "DEPOSIT_LOCK_INVALID_LIFECYCLE";

export type DepositLockLifecycleState = "ACTIVE" | "RELEASED" | "BURNED";

const allowedLifecycleTransitions: Record<DepositLockLifecycleState, ReadonlySet<DepositLockLifecycleState>> = {
  ACTIVE: new Set(["RELEASED", "BURNED"]),
  RELEASED: new Set(),
  BURNED: new Set(),
};

export function canResolveDepositLock(
  currentState: DepositLockLifecycleState,
  nextState: DepositLockLifecycleState,
): boolean {
  return allowedLifecycleTransitions[currentState].has(nextState);
}

export function assertCanResolveDepositLock(
  currentState: DepositLockLifecycleState,
  nextState: DepositLockLifecycleState,
): void {
  if (!canResolveDepositLock(currentState, nextState)) {
    throw new DomainConflictError(
      DEPOSIT_LOCK_LIFECYCLE_CONFLICT_CODE,
      `Invalid deposit lock transition: ${currentState} -> ${nextState}`,
    );
  }
}
