import {
  createPlaceBidService as createPlaceBidServiceInternal,
  placeBid as placeBidInternal,
  type PlaceBidCommand,
  type PlaceBidService,
  type PlaceBidServiceResult,
} from "./application/place_bid_service";
import type { BidSqlRepository } from "./infrastructure/bid_sql_repository";
import type { SqlTransactionRunner } from "../../lib/sql_contract";

export async function placeBid(
  repository: BidSqlRepository,
  command: PlaceBidCommand,
  contentionRetryMax = 0,
): Promise<PlaceBidServiceResult> {
  return placeBidInternal(repository, command, contentionRetryMax);
}

export function createPlaceBidService(
  transactionRunner: SqlTransactionRunner,
  bidLockTimeoutMs: number,
  contentionRetryMax = 0,
): PlaceBidService {
  return createPlaceBidServiceInternal(transactionRunner, bidLockTimeoutMs, contentionRetryMax);
}

export type {
  PlaceBidCommand,
  PlaceBidService,
  PlaceBidServiceResult,
};
