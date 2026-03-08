import {
  assertAuctionTransitionAllowed,
  normalizeAuctionState,
  persistenceAuctionState,
  type AuctionManagedState,
} from "../domain/auction_state_machine";
import {
  createAuctionTransitionRepository,
  newAuctionTransitionId,
  type AuctionTransitionRepository,
} from "../infrastructure/auction_transition_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

export type AuctionTransitionCommand = {
  auctionId: string;
  toState: AuctionManagedState;
  trigger: string;
  reason?: string;
  actorId?: string;
  occurredAt?: Date;
};

export type AuctionTransitionCommandResult = {
  auctionId: string;
  fromState: AuctionManagedState;
  toState: AuctionManagedState;
  version: number;
  transitionId: string;
};

export type AuctionLifecycleTransitionCommand = Omit<AuctionTransitionCommand, "toState">;

export async function transitionAuctionState(
  repository: AuctionTransitionRepository,
  command: AuctionTransitionCommand,
): Promise<AuctionTransitionCommandResult> {
  return repository.transaction(async (tx) => {
    const auction = await tx.getAuctionForUpdate(command.auctionId);
    const fromState = normalizeAuctionState(auction.state);

    assertAuctionTransitionAllowed(fromState, command.toState);

    const transitionId = newAuctionTransitionId();
    const occurredAt = command.occurredAt ?? new Date();
    const nextVersion = auction.version + 1;

    await tx.persistTransitionAndState(command.auctionId, persistenceAuctionState(command.toState), nextVersion, {
      transitionId,
      fromState: persistenceAuctionState(fromState),
      toState: persistenceAuctionState(command.toState),
      trigger: command.trigger,
      reason: command.reason,
      actorId: command.actorId,
      occurredAt,
    });

    return {
      auctionId: command.auctionId,
      fromState,
      toState: command.toState,
      version: nextVersion,
      transitionId,
    };
  });
}

export async function startAuction(
  repository: AuctionTransitionRepository,
  command: AuctionLifecycleTransitionCommand,
): Promise<AuctionTransitionCommandResult> {
  return transitionAuctionState(repository, {
    ...command,
    toState: "LIVE",
  });
}

export async function closeAuction(
  repository: AuctionTransitionRepository,
  command: AuctionLifecycleTransitionCommand,
): Promise<AuctionTransitionCommandResult> {
  return transitionAuctionState(repository, {
    ...command,
    toState: "ENDED",
  });
}

export async function markPaymentPending(
  repository: AuctionTransitionRepository,
  command: AuctionLifecycleTransitionCommand,
): Promise<AuctionTransitionCommandResult> {
  return transitionAuctionState(repository, {
    ...command,
    toState: "PAYMENT_PENDING",
  });
}

export async function markDefaulted(
  repository: AuctionTransitionRepository,
  command: AuctionLifecycleTransitionCommand,
): Promise<AuctionTransitionCommandResult> {
  return transitionAuctionState(repository, {
    ...command,
    toState: "DEFAULTED",
  });
}

export function createAuctionTransitionService(transactionRunner: SqlTransactionRunner): {
  transitionAuctionState: (command: AuctionTransitionCommand) => Promise<AuctionTransitionCommandResult>;
  startAuction: (command: AuctionLifecycleTransitionCommand) => Promise<AuctionTransitionCommandResult>;
  closeAuction: (command: AuctionLifecycleTransitionCommand) => Promise<AuctionTransitionCommandResult>;
  markPaymentPending: (command: AuctionLifecycleTransitionCommand) => Promise<AuctionTransitionCommandResult>;
  markDefaulted: (command: AuctionLifecycleTransitionCommand) => Promise<AuctionTransitionCommandResult>;
} {
  const repository = createAuctionTransitionRepository(transactionRunner);

  return {
    transitionAuctionState: async (command: AuctionTransitionCommand) => {
      return transitionAuctionState(repository, command);
    },
    startAuction: async (command: AuctionLifecycleTransitionCommand) => {
      return startAuction(repository, command);
    },
    closeAuction: async (command: AuctionLifecycleTransitionCommand) => {
      return closeAuction(repository, command);
    },
    markPaymentPending: async (command: AuctionLifecycleTransitionCommand) => {
      return markPaymentPending(repository, command);
    },
    markDefaulted: async (command: AuctionLifecycleTransitionCommand) => {
      return markDefaulted(repository, command);
    },
  };
}
