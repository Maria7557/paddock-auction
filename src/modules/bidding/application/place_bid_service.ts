import { BidContentionConflictError } from "../domain/bid_domain_errors";
import type { PlaceBidStorageInput, PlaceBidStorageResult } from "../infrastructure/bid_sql_repository";
import { createBidSqlRepository, type BidSqlRepository } from "../infrastructure/bid_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

export type PlaceBidCommand = PlaceBidStorageInput;

export type PlaceBidServiceResult = PlaceBidStorageResult;

export type PlaceBidService = {
  placeBid(command: PlaceBidCommand): Promise<PlaceBidServiceResult>;
};

export async function placeBid(
  repository: BidSqlRepository,
  command: PlaceBidCommand,
  contentionRetryMax = 0,
): Promise<PlaceBidServiceResult> {
  const maxAttempts = Math.max(0, Math.floor(contentionRetryMax));

  let attempt = 0;

  while (true) {
    try {
      return await repository.executePlaceBid(command);
    } catch (error) {
      if (!(error instanceof BidContentionConflictError) || attempt >= maxAttempts) {
        throw error;
      }

      attempt += 1;
    }
  }
}

export function createPlaceBidService(
  transactionRunner: SqlTransactionRunner,
  bidLockTimeoutMs: number,
  contentionRetryMax = 0,
): PlaceBidService {
  const repository = createBidSqlRepository(transactionRunner, bidLockTimeoutMs);

  return {
    async placeBid(command: PlaceBidCommand): Promise<PlaceBidServiceResult> {
      try {
        return await placeBid(repository, command, contentionRetryMax);
      } catch (error) {
        if (error instanceof BidContentionConflictError) {
          throw error;
        }

        throw error;
      }
    },
  };
}
