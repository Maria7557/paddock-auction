import assert from "node:assert/strict";
import test from "node:test";

import { createPlaceBidService, type PlaceBidService } from "../../src/modules/bidding/application/place_bid_service";
import { BidContentionConflictError } from "../../src/modules/bidding/domain/bid_domain_errors";
import { bidErrorCodes } from "../../src/modules/bidding/domain/bid_error_codes";
import { createPostBidHandler } from "../../src/modules/bidding/transport/post_bid_handler";
import { createWalletService } from "../../src/modules/wallet/wallet_service";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";
import { createMigratedTestDb } from "./helpers/migration_harness";

async function withMigratedDb(
  assertion: (context: Awaited<ReturnType<typeof createMigratedTestDb>>) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion(migratedDb);
  } finally {
    await migratedDb.cleanup();
  }
}

async function insertAuction(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  input: {
    id: string;
    state?: string;
    currentPrice?: number;
    minIncrement?: number;
    lastBidSequence?: number;
    startsAt?: string;
    endsAt?: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO auctions (
       id,
       vehicle_id,
       seller_company_id,
       state,
       current_price,
       min_increment,
       last_bid_sequence,
       starts_at,
       ends_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.id,
      `vehicle-${input.id}`,
      `seller-${input.id}`,
      input.state ?? "LIVE",
      input.currentPrice ?? 100,
      input.minIncrement ?? 5,
      input.lastBidSequence ?? 0,
      input.startsAt ?? "2026-03-01T00:00:00Z",
      input.endsAt ?? "2026-03-02T00:00:00Z",
    ],
  );
}

async function upsertWallet(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>["db"],
  userId: string,
  balance: number,
): Promise<void> {
  await db.query(
    `INSERT INTO "User" (
       id,
       email
     ) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@example.test`],
  );

  await db.query(
    `INSERT INTO "Wallet" (
       id,
       "userId",
       balance,
       "lockedBalance"
     ) VALUES ($1, $2, $3, 0)
     ON CONFLICT ("userId")
     DO UPDATE SET balance = EXCLUDED.balance`,
    [`wallet-${userId}`, userId, balance],
  );
}

function buildRequest(payload: {
  auction_id: string;
  company_id: string;
  user_id: string;
  amount: number;
}, idempotencyKey: string): Request {
  return new Request("https://example.com/api/bids", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(payload),
  });
}

async function parseResponse(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown>; rawBody: string; errorCode: string | null }> {
  const rawBody = await response.text();

  return {
    status: response.status,
    body: JSON.parse(rawBody) as Record<string, unknown>,
    rawBody,
    errorCode: response.headers.get("x-error-code"),
  };
}

function createAllowedHandler(
  placeBidService: Pick<PlaceBidService, "placeBid">,
  floodThreshold = 50,
  incrementBidFloodConflictsFn: (auctionId: string) => Promise<{ count: number | null }> = async () => ({
    count: 0,
  }),
): (request: Request) => Promise<Response> {
  return createPostBidHandler({
    placeBidService,
    readDisableBiddingFlagFn: async () => ({
      disabled: false,
      key: "flags:disable_bidding",
      source: "default",
    }),
    incrementBidRateLimitsFn: async () => ({
      allowed: true,
      degraded: false,
      keys: {
        user: "rl:bid:user:test",
        company: "rl:bid:company:test",
        ip: "rl:bid:ip:test",
      },
      limits: {
        user: 15,
        company: 20,
        ip: 60,
      },
      counts: {
        user: 1,
        company: 1,
        ip: 1,
      },
      exceeded: [],
    }),
    incrementBidFloodConflictsFn,
    bidFloodConflictThreshold: floodThreshold,
    now: () => new Date("2026-03-01T10:00:00Z"),
  });
}

test("idempotency replay returns exact stored response", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-idem-replay", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-replay", 6_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const requestPayload = {
      auction_id: "auction-idem-replay",
      company_id: "company-replay",
      user_id: "user-replay",
      amount: 120,
    };

    const first = await parseResponse(await handler(buildRequest(requestPayload, "idem-replay-1")));
    const second = await parseResponse(await handler(buildRequest(requestPayload, "idem-replay-1")));

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.rawBody, first.rawBody);
    assert.deepEqual(second.body, first.body);

    const bidCount = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM bids WHERE auction_id = $1",
      ["auction-idem-replay"],
    );

    assert.equal(bidCount.rows[0].count, 1);
  });
});

test("idempotency hash mismatch returns deterministic 409", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-idem-conflict", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-conflict", 6_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const basePayload = {
      auction_id: "auction-idem-conflict",
      company_id: "company-conflict",
      user_id: "user-conflict",
      amount: 120,
    };

    const first = await parseResponse(await handler(buildRequest(basePayload, "idem-conflict-1")));
    assert.equal(first.status, 201);

    const mismatch = await parseResponse(
      await handler(
        buildRequest(
          {
            ...basePayload,
            amount: 121,
          },
          "idem-conflict-1",
        ),
      ),
    );

    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.errorCode, bidErrorCodes.idempotencyConflict);
    assert.equal(mismatch.body.error_code, bidErrorCodes.idempotencyConflict);
  });
});

test("rate-limited precheck returns 429 BID_RATE_LIMITED", async () => {
  const handler = createPostBidHandler({
    placeBidService: {
      placeBid: async () => {
        throw new Error("should not execute placeBid when rate limited");
      },
    },
    readDisableBiddingFlagFn: async () => ({
      disabled: false,
      key: "flags:disable_bidding",
      source: "default",
    }),
    incrementBidRateLimitsFn: async () => ({
      allowed: false,
      degraded: false,
      keys: {
        user: "u",
        company: "c",
        ip: "i",
      },
      limits: {
        user: 15,
        company: 20,
        ip: 60,
      },
      counts: {
        user: 16,
        company: 1,
        ip: 1,
      },
      exceeded: ["user"],
    }),
    incrementBidFloodConflictsFn: async () => ({ count: 0 }),
    bidFloodConflictThreshold: 50,
    now: () => new Date("2026-03-01T10:00:00Z"),
  });

  const response = await parseResponse(
    await handler(
      buildRequest(
        {
          auction_id: "auction-rate-limit",
          company_id: "company-rate-limit",
          user_id: "user-rate-limit",
          amount: 120,
        },
        "idem-rate-limit",
      ),
    ),
  );

  assert.equal(response.status, 429);
  assert.equal(response.errorCode, bidErrorCodes.bidRateLimited);
  assert.equal(response.body.error_code, bidErrorCodes.bidRateLimited);
});

test("disable-bidding flag precheck returns 503 BIDDING_DISABLED", async () => {
  const handler = createPostBidHandler({
    placeBidService: {
      placeBid: async () => {
        throw new Error("should not execute placeBid when bidding is disabled");
      },
    },
    readDisableBiddingFlagFn: async () => ({
      disabled: true,
      key: "flags:disable_bidding",
      source: "redis",
    }),
    incrementBidRateLimitsFn: async () => ({
      allowed: true,
      degraded: false,
      keys: {
        user: "u",
        company: "c",
        ip: "i",
      },
      limits: {
        user: 15,
        company: 20,
        ip: 60,
      },
      counts: {
        user: 1,
        company: 1,
        ip: 1,
      },
      exceeded: [],
    }),
    incrementBidFloodConflictsFn: async () => ({ count: 0 }),
    bidFloodConflictThreshold: 50,
    now: () => new Date("2026-03-01T10:00:00Z"),
  });

  const response = await parseResponse(
    await handler(
      buildRequest(
        {
          auction_id: "auction-disabled",
          company_id: "company-disabled",
          user_id: "user-disabled",
          amount: 120,
        },
        "idem-disabled",
      ),
    ),
  );

  assert.equal(response.status, 503);
  assert.equal(response.errorCode, bidErrorCodes.biddingDisabled);
  assert.equal(response.body.error_code, bidErrorCodes.biddingDisabled);
});

test("expected contention path returns 409 conflict and never 500", async () => {
  const handler = createAllowedHandler(
    {
      placeBid: async () => {
        throw new BidContentionConflictError(25);
      },
    },
    5,
    async () => ({ count: 1 }),
  );

  const response = await parseResponse(
    await handler(
      buildRequest(
        {
          auction_id: "auction-contention",
          company_id: "company-contention",
          user_id: "user-contention",
          amount: 125,
        },
        "idem-contention",
      ),
    ),
  );

  assert.equal(response.status, 409);
  assert.notEqual(response.status, 500);
  assert.equal(response.errorCode, bidErrorCodes.bidContentionConflict);
});

test("flood protection returns 429 after repeated contention conflicts", async () => {
  let floodCounter = 0;

  const handler = createAllowedHandler(
    {
      placeBid: async () => {
        throw new BidContentionConflictError(50);
      },
    },
    3,
    async () => {
      floodCounter += 1;
      return { count: floodCounter };
    },
  );

  const payload = {
    auction_id: "auction-flood",
    company_id: "company-flood",
    user_id: "user-flood",
    amount: 150,
  };

  const first = await parseResponse(await handler(buildRequest(payload, "idem-flood-1")));
  const second = await parseResponse(await handler(buildRequest(payload, "idem-flood-2")));
  const third = await parseResponse(await handler(buildRequest(payload, "idem-flood-3")));

  assert.equal(first.status, 409);
  assert.equal(second.status, 409);
  assert.notEqual(first.status, 500);
  assert.notEqual(second.status, 500);
  assert.equal(third.status, 429);
  assert.equal(third.errorCode, bidErrorCodes.bidFloodProtected);
});

test("50+ parallel bids maintain unique monotonic sequence numbers", async () => {
  await withMigratedDb(async ({ db }) => {
    const bidCountTarget = 60;

    await insertAuction(db, {
      id: "auction-sequence",
      currentPrice: 100,
      minIncrement: 1,
      lastBidSequence: 0,
    });

    for (let index = 1; index <= bidCountTarget; index += 1) {
      await upsertWallet(db, `user-seq-${index}`, 10_000);
    }

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const requests = Array.from({ length: bidCountTarget }, (_, index) => {
      const company = `company-seq-${index + 1}`;
      const request = buildRequest(
        {
          auction_id: "auction-sequence",
          company_id: company,
          user_id: `user-seq-${index + 1}`,
          amount: 101 + index,
        },
        `idem-seq-${index + 1}`,
      );

      return new Promise<{
        status: number;
        body: Record<string, unknown>;
        rawBody: string;
        errorCode: string | null;
      }>(
        (resolve, reject) => {
          setTimeout(async () => {
            try {
              resolve(await parseResponse(await handler(request)));
            } catch (error) {
              reject(error);
            }
          }, index);
        },
      );
    });

    const responses = await Promise.all(requests);

    for (const response of responses) {
      if (response.status !== 201) {
        assert.fail(`Expected 201 for concurrent bid but received ${response.status}`);
      }
    }

    const bidRows = await db.query<{ sequence_no: number }>(
      "SELECT sequence_no FROM bids WHERE auction_id = $1 ORDER BY sequence_no ASC",
      ["auction-sequence"],
    );

    const sequenceNumbers = bidRows.rows.map((row) => Number(row.sequence_no));
    assert.equal(sequenceNumbers.length, bidCountTarget);
    assert.deepEqual(
      sequenceNumbers,
      Array.from({ length: bidCountTarget }, (_, index) => index + 1),
    );

    const distinctCount = new Set(sequenceNumbers).size;
    assert.equal(distinctCount, sequenceNumbers.length);
  });
});

test("bid without wallet funds is rejected", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-no-deposit", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-no-deposit", 4_999);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const response = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-no-deposit",
            company_id: "company-no-deposit",
            user_id: "user-no-deposit",
            amount: 150,
          },
          "idem-no-deposit",
        ),
      ),
    );

    assert.equal(response.status, 409);
    assert.equal(response.errorCode, bidErrorCodes.depositRequired);
    assert.equal(response.body.error_code, bidErrorCodes.depositRequired);

    const bidCount = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM bids WHERE auction_id = $1",
      ["auction-no-deposit"],
    );

    assert.equal(bidCount.rows[0].count, 0);
  });
});

test("top-up funds are usable for bidding deposit lock", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-topup-deposit", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-topup-deposit", 0);

    const transactionRunner = createPgliteTransactionRunner(db);
    const walletService = createWalletService(transactionRunner);
    await walletService.topUpWallet("user-topup-deposit", 6_000);

    const placeBidService = createPlaceBidService(transactionRunner, 250);
    const handler = createAllowedHandler(placeBidService);

    const response = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-topup-deposit",
            company_id: "company-topup-deposit",
            user_id: "user-topup-deposit",
            amount: 150,
          },
          "idem-topup-deposit",
        ),
      ),
    );

    assert.equal(response.status, 201);

    const walletRow = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-topup-deposit"],
    );

    assert.equal(Number(walletRow.rows[0].balance), 1_000);
    assert.equal(Number(walletRow.rows[0].lockedBalance), 5_000);
  });
});

test("first bid creates deposit lock", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-first-lock", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-first-lock", 7_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const response = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-first-lock",
            company_id: "company-first-lock",
            user_id: "user-first-lock",
            amount: 120,
          },
          "idem-first-lock-1",
        ),
      ),
    );

    assert.equal(response.status, 201);

    const lockRows = await db.query<{ count: number; amount: string }>(
      `SELECT COUNT(*)::int AS count, MAX(amount)::text AS amount
       FROM deposit_locks
       WHERE auction_id = $1
         AND wallet_id = $2
         AND status = 'ACTIVE'`,
      ["auction-first-lock", "wallet-user-first-lock"],
    );

    assert.equal(lockRows.rows[0].count, 1);
    assert.equal(Number(lockRows.rows[0].amount), 5_000);

    const walletRows = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-first-lock"],
    );

    assert.equal(Number(walletRows.rows[0].balance), 2_000);
    assert.equal(Number(walletRows.rows[0].lockedBalance), 5_000);

    const walletLedgerRows = await db.query<{ type: string; amount: number; reference: string }>(
      `SELECT type, amount, reference
       FROM "WalletLedger"
       WHERE "walletId" = $1
         AND type = 'DEPOSIT_LOCK'`,
      ["wallet-user-first-lock"],
    );
    assert.equal(walletLedgerRows.rows.length, 1);
    assert.equal(walletLedgerRows.rows[0].type, "DEPOSIT_LOCK");
    assert.equal(Number(walletLedgerRows.rows[0].amount), 5_000);
    assert.ok(typeof walletLedgerRows.rows[0].reference === "string");
    assert.ok(walletLedgerRows.rows[0].reference.length > 0);
  });
});

test("second bid by same user does not create additional lock", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, { id: "auction-second-lock", currentPrice: 100, minIncrement: 5 });
    await upsertWallet(db, "user-second-lock", 9_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const firstResponse = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-second-lock",
            company_id: "company-second-lock",
            user_id: "user-second-lock",
            amount: 120,
          },
          "idem-second-lock-1",
        ),
      ),
    );

    const secondResponse = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-second-lock",
            company_id: "company-second-lock",
            user_id: "user-second-lock",
            amount: 130,
          },
          "idem-second-lock-2",
        ),
      ),
    );

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);

    const lockRows = await db.query<{ count: number; amount: string }>(
      `SELECT COUNT(*)::int AS count, MAX(amount)::text AS amount
       FROM deposit_locks
       WHERE auction_id = $1
         AND wallet_id = $2
         AND status = 'ACTIVE'`,
      ["auction-second-lock", "wallet-user-second-lock"],
    );

    assert.equal(lockRows.rows[0].count, 1);
    assert.equal(Number(lockRows.rows[0].amount), 5_000);

    const walletRows = await db.query<{ balance: number; lockedBalance: number }>(
      `SELECT balance, "lockedBalance"
       FROM "Wallet"
       WHERE "userId" = $1`,
      ["user-second-lock"],
    );

    assert.equal(Number(walletRows.rows[0].balance), 4_000);
    assert.equal(Number(walletRows.rows[0].lockedBalance), 5_000);
  });
});

test("bid in last 2 minutes extends auction end time by 120 seconds", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-anti-snipe-window",
      currentPrice: 100,
      minIncrement: 5,
      startsAt: "2026-03-01T00:00:00Z",
      endsAt: "2026-03-01T10:01:30Z",
    });
    await upsertWallet(db, "user-anti-snipe-window", 9_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const response = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-anti-snipe-window",
            company_id: "company-anti-snipe-window",
            user_id: "user-anti-snipe-window",
            amount: 120,
          },
          "idem-anti-snipe-window-1",
        ),
      ),
    );

    assert.equal(response.status, 201);

    const auctionRow = await db.query<{ ends_at: string; extension_count: number }>(
      `SELECT ends_at, extension_count
       FROM auctions
       WHERE id = $1`,
      ["auction-anti-snipe-window"],
    );

    assert.equal(new Date(auctionRow.rows[0].ends_at).toISOString(), "2026-03-01T10:03:30.000Z");
    assert.equal(Number(auctionRow.rows[0].extension_count), 1);
  });
});

test("bid earlier than last 2 minutes does not extend auction end time", async () => {
  await withMigratedDb(async ({ db }) => {
    await insertAuction(db, {
      id: "auction-anti-snipe-early",
      currentPrice: 100,
      minIncrement: 5,
      startsAt: "2026-03-01T00:00:00Z",
      endsAt: "2026-03-01T10:05:00Z",
    });
    await upsertWallet(db, "user-anti-snipe-early", 9_000);

    const placeBidService = createPlaceBidService(createPgliteTransactionRunner(db), 250);
    const handler = createAllowedHandler(placeBidService);

    const response = await parseResponse(
      await handler(
        buildRequest(
          {
            auction_id: "auction-anti-snipe-early",
            company_id: "company-anti-snipe-early",
            user_id: "user-anti-snipe-early",
            amount: 120,
          },
          "idem-anti-snipe-early-1",
        ),
      ),
    );

    assert.equal(response.status, 201);

    const auctionRow = await db.query<{ ends_at: string; extension_count: number }>(
      `SELECT ends_at, extension_count
       FROM auctions
       WHERE id = $1`,
      ["auction-anti-snipe-early"],
    );

    assert.equal(new Date(auctionRow.rows[0].ends_at).toISOString(), "2026-03-01T10:05:00.000Z");
    assert.equal(Number(auctionRow.rows[0].extension_count), 0);
  });
});
