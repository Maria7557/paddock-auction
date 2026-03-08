import assert from "node:assert/strict";
import test from "node:test";

import { BidContentionConflictError } from "../domain/bid_domain_errors";
import { placeBid } from "./place_bid_service";
import type {
  BidSqlRepository,
  PlaceBidStorageInput,
  PlaceBidStorageResult,
} from "../infrastructure/bid_sql_repository";

function buildCommand(): PlaceBidStorageInput {
  return {
    auctionId: "auction-retry-test",
    companyId: "company-retry-test",
    userId: "user-retry-test",
    amount: 120,
    idempotencyKey: "idem-retry-test",
    requestHash: "hash-retry-test",
    occurredAt: new Date("2026-03-01T10:00:00Z"),
  };
}

function buildSuccessResult(): PlaceBidStorageResult {
  return {
    kind: "success",
    responseStatus: 201,
    responseBody: {
      result: "accepted",
    },
    lockWaitMs: 2,
    timing: {
      advisoryLockWaitMs: 2,
      dbTransactionMs: 4,
      depositLockMs: 1,
      walletUpdateMs: 0,
      bidInsertMs: 1,
      walletLockMutationMs: 1,
      auctionUpdateMs: 0,
      bidInsertAuctionUpdateMs: 1,
    },
  };
}

test("placeBid retries contention up to max and then succeeds", async () => {
  let attempts = 0;

  const repository: BidSqlRepository = {
    executePlaceBid: async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new BidContentionConflictError(10);
      }

      return buildSuccessResult();
    },
  };

  const result = await placeBid(repository, buildCommand(), 2);

  assert.equal(result.kind, "success");
  assert.equal(attempts, 3);
});

test("placeBid throws contention after retry budget is exhausted", async () => {
  let attempts = 0;

  const repository: BidSqlRepository = {
    executePlaceBid: async () => {
      attempts += 1;
      throw new BidContentionConflictError(10);
    },
  };

  await assert.rejects(async () => placeBid(repository, buildCommand(), 1), BidContentionConflictError);
  assert.equal(attempts, 2);
});
