import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeBidPayload, createBidRequestHash } from "./bid_request_hash";

test("canonical bid payload uses deterministic key order and money normalization", () => {
  const canonical = canonicalizeBidPayload({
    auctionId: "auction-1",
    companyId: "company-1",
    userId: "user-1",
    amount: 120,
  });

  assert.deepEqual(canonical, {
    auction_id: "auction-1",
    company_id: "company-1",
    user_id: "user-1",
    amount: "120.00",
  });
});

test("same semantic payload yields identical request hash", () => {
  const first = createBidRequestHash({
    auctionId: "auction-2",
    companyId: "company-2",
    userId: "user-2",
    amount: 120,
  });

  const second = createBidRequestHash({
    auctionId: "auction-2",
    companyId: "company-2",
    userId: "user-2",
    amount: 120.0,
  });

  assert.equal(first, second);

  const third = createBidRequestHash({
    auctionId: "auction-2",
    companyId: "company-2",
    userId: "user-2",
    amount: 121,
  });

  assert.notEqual(first, third);
});
