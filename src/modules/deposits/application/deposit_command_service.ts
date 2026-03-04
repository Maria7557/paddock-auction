import { randomUUID } from "node:crypto";

import { DomainConflictError } from "../../../lib/domain_errors";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";
import {
  assertCanResolveDepositLock,
  type DepositLockLifecycleState,
} from "../domain/deposit_lock_lifecycle";
import {
  createDepositCommandRepository,
  DEPOSIT_WALLET_NOT_FOUND_CODE,
  type DepositCommandRepository,
  type DepositLockSnapshot,
  type DepositWalletSnapshot,
} from "../infrastructure/deposit_command_sql_repository";

export const DEPOSIT_INSUFFICIENT_AVAILABLE_BALANCE_CODE = "DEPOSIT_INSUFFICIENT_AVAILABLE_BALANCE";
export const DEPOSIT_INSUFFICIENT_LOCKED_BALANCE_CODE = "DEPOSIT_INSUFFICIENT_LOCKED_BALANCE";
export const DEPOSIT_LOCK_ALREADY_ACTIVE_CODE = "DEPOSIT_LOCK_ALREADY_ACTIVE";

export const depositMutationLockOrder = ["wallet row", "deposit_lock row", "auction row"] as const;

export type AdminWalletCreditCommand = {
  companyId: string;
  currency: string;
  amount: number;
};

export type AcquireDepositLockCommand = {
  auctionId: string;
  companyId: string;
  currency: string;
  amount: number;
};

export type ResolveDepositLockCommand = {
  lockId: string;
  currency: string;
  resolutionReason?: string;
  occurredAt?: Date;
};

export type AdminWalletCreditResult = {
  wallet: DepositWalletSnapshot;
};

export type AcquireDepositLockResult = {
  lock: DepositLockSnapshot;
  wallet: DepositWalletSnapshot;
  reusedExistingLock: boolean;
};

export type ResolveDepositLockResult = {
  lock: DepositLockSnapshot;
  wallet: DepositWalletSnapshot;
};

function assertPositiveAmount(amount: number, fieldName: string): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainConflictError("DEPOSIT_INVALID_AMOUNT", `${fieldName} must be a positive amount`);
  }
}

function assertWalletCanAcquire(wallet: DepositWalletSnapshot, amount: number): void {
  if (wallet.availableBalance < amount) {
    throw new DomainConflictError(
      DEPOSIT_INSUFFICIENT_AVAILABLE_BALANCE_CODE,
      `Insufficient available balance: required ${amount}, available ${wallet.availableBalance}`,
    );
  }
}

function assertWalletCanResolve(wallet: DepositWalletSnapshot, amount: number): void {
  if (wallet.lockedBalance < amount) {
    throw new DomainConflictError(
      DEPOSIT_INSUFFICIENT_LOCKED_BALANCE_CODE,
      `Insufficient locked balance: required ${amount}, locked ${wallet.lockedBalance}`,
    );
  }
}

export async function adminWalletCredit(
  repository: DepositCommandRepository,
  command: AdminWalletCreditCommand,
): Promise<AdminWalletCreditResult> {
  assertPositiveAmount(command.amount, "amount");

  return repository.transaction(async (tx) => {
    let wallet = await tx.lockWalletRow(command.companyId, command.currency);

    if (wallet === null) {
      wallet = await tx.ensureWalletRow(command.companyId, command.currency, randomUUID());
    }

    const creditedWallet = await tx.incrementWalletAvailable(wallet.id, command.amount);

    return { wallet: creditedWallet };
  });
}

export async function acquireDepositLock(
  repository: DepositCommandRepository,
  command: AcquireDepositLockCommand,
): Promise<AcquireDepositLockResult> {
  assertPositiveAmount(command.amount, "amount");

  return repository.transaction(async (tx) => {
    // Deterministic lock order: wallet row -> deposit_lock row -> auction row.
    const wallet = await tx.lockWalletRow(command.companyId, command.currency);

    if (wallet === null) {
      throw new DomainConflictError(
        DEPOSIT_WALLET_NOT_FOUND_CODE,
        `Wallet for company ${command.companyId} and currency ${command.currency} was not found`,
      );
    }

    const existingActiveLock = await tx.lockActiveLockForAuctionCompany(command.auctionId, command.companyId);
    await tx.lockAuctionRow(command.auctionId);

    if (existingActiveLock !== null) {
      if (existingActiveLock.amount !== command.amount) {
        throw new DomainConflictError(
          DEPOSIT_LOCK_ALREADY_ACTIVE_CODE,
          `Active lock already exists for auction ${command.auctionId} and company ${command.companyId}`,
        );
      }

      return {
        lock: existingActiveLock,
        wallet,
        reusedExistingLock: true,
      };
    }

    assertWalletCanAcquire(wallet, command.amount);

    const updatedWallet = await tx.applyWalletAcquire(wallet.id, command.amount);

    if (updatedWallet === null) {
      throw new DomainConflictError(
        DEPOSIT_INSUFFICIENT_AVAILABLE_BALANCE_CODE,
        `Insufficient available balance while acquiring lock for wallet ${wallet.id}`,
      );
    }

    const createdLock = await tx.insertActiveLock(
      randomUUID(),
      command.auctionId,
      command.companyId,
      command.amount,
    );

    return {
      lock: createdLock,
      wallet: updatedWallet,
      reusedExistingLock: false,
    };
  });
}

async function resolveDepositLockInternal(
  repository: DepositCommandRepository,
  command: ResolveDepositLockCommand,
  nextState: Extract<DepositLockLifecycleState, "RELEASED" | "BURNED">,
): Promise<ResolveDepositLockResult> {
  return repository.transaction(async (tx) => {
    const lockReference = await tx.loadLockReference(command.lockId);

    // Deterministic lock order: wallet row -> deposit_lock row -> auction row.
    const wallet = await tx.lockWalletRow(lockReference.companyId, command.currency);

    if (wallet === null) {
      throw new DomainConflictError(
        DEPOSIT_WALLET_NOT_FOUND_CODE,
        `Wallet for company ${lockReference.companyId} and currency ${command.currency} was not found`,
      );
    }

    const lock = await tx.lockById(command.lockId);
    await tx.lockAuctionRow(lock.auctionId);

    assertCanResolveDepositLock(lock.status, nextState);
    assertWalletCanResolve(wallet, lock.amount);

    const updatedWallet =
      nextState === "RELEASED"
        ? await tx.applyWalletRelease(wallet.id, lock.amount)
        : await tx.applyWalletBurn(wallet.id, lock.amount);

    if (updatedWallet === null) {
      throw new DomainConflictError(
        DEPOSIT_INSUFFICIENT_LOCKED_BALANCE_CODE,
        `Insufficient locked balance while resolving lock ${lock.id}`,
      );
    }

    const resolvedLock = await tx.resolveLock(
      lock.id,
      nextState,
      command.occurredAt ?? new Date(),
      command.resolutionReason,
    );

    return {
      lock: resolvedLock,
      wallet: updatedWallet,
    };
  });
}

export async function releaseDepositLock(
  repository: DepositCommandRepository,
  command: ResolveDepositLockCommand,
): Promise<ResolveDepositLockResult> {
  return resolveDepositLockInternal(repository, command, "RELEASED");
}

export async function burnDepositLock(
  repository: DepositCommandRepository,
  command: ResolveDepositLockCommand,
): Promise<ResolveDepositLockResult> {
  return resolveDepositLockInternal(repository, command, "BURNED");
}

export function createDepositCommandService(transactionRunner: SqlTransactionRunner): {
  adminWalletCredit: (command: AdminWalletCreditCommand) => Promise<AdminWalletCreditResult>;
  acquireDepositLock: (command: AcquireDepositLockCommand) => Promise<AcquireDepositLockResult>;
  releaseDepositLock: (command: ResolveDepositLockCommand) => Promise<ResolveDepositLockResult>;
  burnDepositLock: (command: ResolveDepositLockCommand) => Promise<ResolveDepositLockResult>;
} {
  const repository = createDepositCommandRepository(transactionRunner);

  return {
    adminWalletCredit: async (command) => adminWalletCredit(repository, command),
    acquireDepositLock: async (command) => acquireDepositLock(repository, command),
    releaseDepositLock: async (command) => releaseDepositLock(repository, command),
    burnDepositLock: async (command) => burnDepositLock(repository, command),
  };
}
