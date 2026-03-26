import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  acquireOrVerifyBuyingPowerLock,
  BuyingPowerCommandError,
  initializeBuyerBidSummary,
  primeBuyingPowerState,
  readBuyingPowerSnapshot,
  recordLeadingBid,
  releaseLeadingBidOnOutbid,
} from "../../deposits/application/deposit_commands";

const BID_REQUEST_TTL_DAYS = 90;
const ANTI_SNIPING_WINDOW_MS = 3 * 60 * 1000;
const ANTI_SNIPING_EXTENSION_INTERVAL_SQL = Prisma.sql`INTERVAL '3 minutes'`;
const ZERO_DECIMAL = new Prisma.Decimal(0);

type Decimal = Prisma.Decimal;

type JsonRecord = Record<string, unknown>;

type BidRequestResponseResult = {
  kind: "success" | "replay" | "rejected";
  statusCode: number;
  body: JsonRecord;
  bidId: string | null;
};

type TransactionSuccessResult = {
  kind: "success";
  statusCode: 201;
  body: JsonRecord;
  bidId: string;
};

type TransactionRejectedResult = {
  kind: "rejected";
  statusCode: number;
  body: JsonRecord;
};

type TransactionResult = TransactionSuccessResult | TransactionRejectedResult;

type ExecutePlaceBidCommandInput = {
  auctionId: string;
  companyId: string;
  userId: string;
  amount: number;
  idempotencyKey: string;
};

type PlaceBidTransactionInput = {
  bidRequestId: string;
  auctionId: string;
  companyId: string;
  userId: string;
  amount: Decimal;
  idempotencyKey: string;
  occurredAt: Date;
};

type AuctionLockRow = {
  id: string;
  state: string;
  version: number;
  current_price: Decimal;
  starts_at: Date | string;
  min_increment: Decimal;
  last_bid_sequence: number;
  ends_at: Date | string;
};

type PreviousLeaderRow = {
  id: string;
  company_id: string;
  amount: Decimal;
  sequence_no: number;
  created_at: Date;
};

type EvaluatedBidEligibility = {
  userStatus: string;
  companyStatus: string;
  kycVerified: boolean;
};

class RetryableOptimisticConflictError extends Error {
  constructor() {
    super("Retryable optimistic conflict");
    this.name = "RetryableOptimisticConflictError";
  }
}

function normalizeBidAmount(amount: number): Decimal {
  return new Prisma.Decimal(amount.toFixed(2));
}

function buildBidRequestHash(input: {
  auctionId: string;
  companyId: string;
  userId: string;
  amount: Decimal;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        auctionId: input.auctionId,
        companyId: input.companyId,
        userId: input.userId,
        amount: input.amount.toFixed(2),
      }),
    )
    .digest("hex");
}

function computeBidRequestExpiry(referenceDate: Date): Date {
  const expiresAt = new Date(referenceDate);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + BID_REQUEST_TTL_DAYS);
  return expiresAt;
}

function toStoredJson(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function createPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseStoredResponseBody(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function toDate(value: Date | string, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date in ${fieldName}`);
  }

  return parsed;
}

function rejection(
  error: string,
  statusCode: number,
  extra: Record<string, unknown> = {},
): TransactionRejectedResult {
  return {
    kind: "rejected",
    statusCode,
    body: {
      error,
      ...extra,
    },
  };
}

async function persistBidRequestRejected(
  tx: Prisma.TransactionClient,
  bidRequestId: string,
  result: TransactionRejectedResult,
): Promise<TransactionRejectedResult> {
  await tx.bidRequest.update({
    where: {
      id: bidRequestId,
    },
    data: {
      status: "REJECTED",
      responseStatus: result.statusCode,
      responseBody: toStoredJson(result.body),
    },
  });

  return result;
}

async function appendAuditRecord(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    idempotencyKey: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotencyKey: input.idempotencyKey,
      payload: toStoredJson(input.payload),
      payloadHash: createPayloadHash(input.payload),
    },
  });
}

async function enqueueBidPlacedEvent(
  tx: Prisma.TransactionClient,
  input: {
    bidId: string;
    auctionId: string;
    companyId: string;
    amount: Decimal;
  },
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      aggregateType: "AUCTION",
      aggregateId: input.auctionId,
      eventType: "BID_PLACED",
      partitionKey: input.auctionId,
      payload: {
        type: "BID_PLACED",
        bidId: input.bidId,
        auctionId: input.auctionId,
        companyId: input.companyId,
        amount: input.amount.toFixed(2),
      },
    },
  });
}

async function acquireAuctionAdvisoryLock(
  tx: Prisma.TransactionClient,
  auctionId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${auctionId}), 0)
  `;
}

async function loadPreviousLeader(
  tx: Prisma.TransactionClient,
  auctionId: string,
): Promise<PreviousLeaderRow | null> {
  const rows = await tx.$queryRaw<PreviousLeaderRow[]>`
    SELECT
      id,
      company_id,
      amount,
      sequence_no,
      created_at
    FROM bids
    WHERE auction_id = ${auctionId}
    ORDER BY amount DESC, sequence_no DESC, created_at DESC, id DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function loadAuctionForUpdate(
  tx: Prisma.TransactionClient,
  auctionId: string,
): Promise<AuctionLockRow | null> {
  const rows = await tx.$queryRaw<AuctionLockRow[]>`
    SELECT
      id,
      state,
      version,
      current_price,
      starts_at,
      min_increment,
      last_bid_sequence,
      ends_at
    FROM auctions
    WHERE id = ${auctionId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

async function evaluateBidEligibility(
  tx: Prisma.TransactionClient,
  userId: string,
  companyId: string,
): Promise<EvaluatedBidEligibility | null> {
  const user = await tx.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      role: true,
      status: true,
      kycVerified: true,
      companyUsers: {
        where: {
          companyId,
        },
        take: 1,
        select: {
          companyId: true,
          company: {
            select: {
              status: true,
            },
          },
        },
      },
    },
  });

  const membership = user?.companyUsers[0];
  const companyStatus = membership?.company?.status ?? null;

  if (
    !user ||
    user.role !== "BUYER" ||
    !membership?.companyId ||
    !companyStatus
  ) {
    return null;
  }

  return {
    userStatus: user.status,
    companyStatus,
    kycVerified: user.kycVerified,
  };
}

function buildBuyingPowerResponse(input: {
  activeBidsTotal: Decimal;
  ceiling: Decimal;
}): {
  activeBidsTotal: string;
  ceiling: string;
  remaining: string;
} {
  const remaining = input.ceiling.minus(input.activeBidsTotal);

  return {
    activeBidsTotal: input.activeBidsTotal.toFixed(2),
    ceiling: input.ceiling.toFixed(2),
    remaining: (remaining.lessThan(ZERO_DECIMAL) ? ZERO_DECIMAL : remaining).toFixed(2),
  };
}

async function maybeApplyAntiSnipingExtension(
  tx: Prisma.TransactionClient,
  input: {
    auctionId: string;
    occurredAt: Date;
    currentEndsAt: Date;
  },
): Promise<boolean> {
  const timeLeftMs = input.currentEndsAt.getTime() - input.occurredAt.getTime();

  if (timeLeftMs > ANTI_SNIPING_WINDOW_MS) {
    return false;
  }

  await tx.$executeRaw`
    UPDATE auctions
    SET ends_at = NOW() + ${ANTI_SNIPING_EXTENSION_INTERVAL_SQL},
        extension_count = extension_count + 1,
        updated_at = NOW()
    WHERE id = ${input.auctionId}
  `;

  return true;
}

async function createInProgressBidRequest(
  prismaClient: PrismaClient,
  input: {
    auctionId: string;
    companyId: string;
    idempotencyKey: string;
    requestHash: string;
    occurredAt: Date;
  },
): Promise<{ id: string } | null> {
  return prismaClient.bidRequest.create({
    data: {
      auctionId: input.auctionId,
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: "IN_PROGRESS",
      expiresAt: computeBidRequestExpiry(input.occurredAt),
    },
    select: {
      id: true,
    },
  });
}

async function findExistingBidRequest(
  prismaClient: PrismaClient,
  input: {
    auctionId: string;
    companyId: string;
    idempotencyKey: string;
  },
) {
  return prismaClient.bidRequest.findUnique({
    where: {
      auctionId_companyId_idempotencyKey: {
        auctionId: input.auctionId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
}

async function handleBidRequestReplay(
  prismaClient: PrismaClient,
  input: {
    auctionId: string;
    companyId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<BidRequestResponseResult | null> {
  const existingRequest = await findExistingBidRequest(prismaClient, input);

  if (!existingRequest) {
    return null;
  }

  if (existingRequest.requestHash !== input.requestHash) {
    return {
      kind: "rejected",
      statusCode: 409,
      body: {
        error: "BID_IDEMPOTENCY_CONFLICT",
      },
      bidId: existingRequest.bidId ?? null,
    };
  }

  if (
    existingRequest.responseStatus !== null &&
    existingRequest.responseBody !== null &&
    (existingRequest.status === "SUCCEEDED" ||
      existingRequest.status === "REJECTED" ||
      existingRequest.status === "FAILED")
  ) {
    return {
      kind: "replay",
      statusCode: existingRequest.responseStatus,
      body: parseStoredResponseBody(existingRequest.responseBody),
      bidId: existingRequest.bidId ?? null,
    };
  }

  return {
    kind: "rejected",
    statusCode: 409,
    body: {
      error: "BID_REQUEST_IN_PROGRESS",
    },
    bidId: existingRequest.bidId ?? null,
  };
}

async function executeTransactionAttempt(
  tx: Prisma.TransactionClient,
  input: PlaceBidTransactionInput,
  allowOptimisticRetry: boolean,
): Promise<TransactionResult> {
  await acquireAuctionAdvisoryLock(tx, input.auctionId);

  // Preview the current leader before row locks so we can prime the needed
  // buying-power rows while still respecting the financial lock order.
  const previousLeaderPreview = await loadPreviousLeader(tx, input.auctionId);

  await initializeBuyerBidSummary(tx, input.companyId);

  if (
    previousLeaderPreview !== null &&
    previousLeaderPreview.company_id !== input.companyId
  ) {
    await primeBuyingPowerState(tx, previousLeaderPreview.company_id);
  }

  const auction = await loadAuctionForUpdate(tx, input.auctionId);

  if (!auction) {
    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("BID_AUCTION_NOT_LIVE", 422),
    );
  }

  const auctionEndsAt = toDate(auction.ends_at, "auctions.ends_at");
  const auctionStartsAt = toDate(auction.starts_at, "auctions.starts_at");
  const currentPrice = auction.current_price;
  const minIncrement = auction.min_increment;
  const minimumAcceptedBid = currentPrice.plus(minIncrement);
  const acceptsBids =
    auction.state === "LIVE" ||
    auction.state === "EXTENDED" ||
    auction.state === "SCHEDULED";

  if (!acceptsBids || input.occurredAt.getTime() > auctionEndsAt.getTime()) {
    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("BID_AUCTION_NOT_LIVE", 422),
    );
  }

  if (
    input.amount.lessThanOrEqualTo(currentPrice) ||
    input.amount.lessThan(minimumAcceptedBid)
  ) {
    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("BID_INCREMENT_TOO_LOW", 422, {
        currentHighest: currentPrice.toFixed(2),
        minIncrement: minIncrement.toFixed(2),
        minimumAccepted: minimumAcceptedBid.toFixed(2),
        requested: input.amount.toFixed(2),
      }),
    );
  }

  const eligibility = await evaluateBidEligibility(tx, input.userId, input.companyId);

  if (!eligibility || eligibility.kycVerified !== true) {
    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("KYC_PENDING", 403, {
        message: "Your account is under review.",
      }),
    );
  }

  if (
    eligibility.userStatus.toUpperCase() !== "ACTIVE" ||
    eligibility.companyStatus.toUpperCase() !== "ACTIVE"
  ) {
    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("ACCOUNT_INACTIVE", 403, {
        message: "Account is inactive. Buying is unavailable.",
      }),
    );
  }

  const previewPreviousLeaderAmount =
    previousLeaderPreview?.company_id === input.companyId
      ? previousLeaderPreview.amount
      : ZERO_DECIMAL;
  const exposureDelta = input.amount.minus(previewPreviousLeaderAmount);
  const gateResult = await acquireOrVerifyBuyingPowerLock(
    tx,
    input.companyId,
    exposureDelta,
  );

  if (!gateResult.allowed) {
    if (gateResult.reason === "INSUFFICIENT_DEPOSIT") {
      return persistBidRequestRejected(
        tx,
        input.bidRequestId,
        rejection("BID_INSUFFICIENT_DEPOSIT", 422),
      );
    }

    const effectiveCurrentTotal =
      previousLeaderPreview?.company_id === input.companyId
        ? gateResult.currentTotal.minus(previousLeaderPreview.amount)
        : gateResult.currentTotal;
    const shortfall = effectiveCurrentTotal.plus(input.amount).minus(gateResult.ceiling);

    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("BID_CEILING_EXCEEDED", 422, {
        currentTotal: effectiveCurrentTotal.toFixed(2),
        ceiling: gateResult.ceiling.toFixed(2),
        requested: input.amount.toFixed(2),
        shortfall: (shortfall.lessThan(ZERO_DECIMAL) ? ZERO_DECIMAL : shortfall).toFixed(2),
      }),
    );
  }

  const previousLeader = await loadPreviousLeader(tx, input.auctionId);

  if (previousLeader && previousLeader.company_id !== input.companyId) {
    try {
      await releaseLeadingBidOnOutbid(tx, previousLeader.company_id, previousLeader.amount);
    } catch (error) {
      if (error instanceof BuyingPowerCommandError) {
        return persistBidRequestRejected(
          tx,
          input.bidRequestId,
          rejection(error.code, 422),
        );
      }

      throw error;
    }
  }

  const nextSequenceNo = auction.last_bid_sequence + 1;
  const bidRecord = await tx.bid.create({
    data: {
      auctionId: input.auctionId,
      companyId: input.companyId,
      userId: input.userId,
      amount: input.amount,
      sequenceNo: nextSequenceNo,
    },
    select: {
      id: true,
      auctionId: true,
      amount: true,
      createdAt: true,
    },
  });

  try {
    // When the same buyer is already leading, only the incremental exposure
    // should count against buying power.
    await recordLeadingBid(tx, input.companyId, exposureDelta);
  } catch (error) {
    if (error instanceof BuyingPowerCommandError) {
      return persistBidRequestRejected(
        tx,
        input.bidRequestId,
        rejection(error.code, 422),
      );
    }

    throw error;
  }

  const nextAuctionState =
    auction.state === "SCHEDULED" && input.occurredAt.getTime() >= auctionStartsAt.getTime()
      ? "LIVE"
      : auction.state;
  const updatedRows = await tx.$executeRaw`
    UPDATE auctions
    SET current_price = ${input.amount},
        highest_bid_id = ${bidRecord.id},
        last_bid_sequence = ${nextSequenceNo},
        state = ${nextAuctionState}::"AuctionState",
        version = version + 1,
        updated_at = NOW()
    WHERE id = ${input.auctionId}
      AND version = ${auction.version}
  `;

  if (updatedRows !== 1) {
    if (allowOptimisticRetry) {
      throw new RetryableOptimisticConflictError();
    }

    return persistBidRequestRejected(
      tx,
      input.bidRequestId,
      rejection("BID_OPTIMISTIC_CONFLICT", 409),
    );
  }

  const antiSnipingExtended = await maybeApplyAntiSnipingExtension(tx, {
    auctionId: input.auctionId,
    occurredAt: input.occurredAt,
    currentEndsAt: auctionEndsAt,
  });
  const buyingPowerSnapshot = await readBuyingPowerSnapshot(tx, input.companyId);
  const responseBody = {
    bid: {
      id: bidRecord.id,
      auctionId: bidRecord.auctionId,
      amount: bidRecord.amount.toFixed(2),
      createdAt: bidRecord.createdAt.toISOString(),
    },
    buyingPower: buildBuyingPowerResponse({
      activeBidsTotal: buyingPowerSnapshot.activeBidsTotal,
      ceiling: buyingPowerSnapshot.ceiling,
    }),
  } satisfies JsonRecord;

  await tx.bidRequest.update({
    where: {
      id: input.bidRequestId,
    },
    data: {
      status: "SUCCEEDED",
      responseStatus: 201,
      responseBody: toStoredJson(responseBody),
      bidId: bidRecord.id,
    },
  });

  await appendAuditRecord(tx, {
    actorId: input.userId,
    idempotencyKey: input.idempotencyKey,
    action: "BID_PLACED",
    entityType: "BID",
    entityId: bidRecord.id,
    payload: {
      auctionId: input.auctionId,
      companyId: input.companyId,
      amount: input.amount.toFixed(2),
      exposureDelta: exposureDelta.toFixed(2),
      previousLeaderCompanyId: previousLeader?.company_id ?? null,
      antiSnipingExtended,
    },
  });

  await enqueueBidPlacedEvent(tx, {
    bidId: bidRecord.id,
    auctionId: input.auctionId,
    companyId: input.companyId,
    amount: input.amount,
  });

  return {
    kind: "success",
    statusCode: 201,
    body: responseBody,
    bidId: bidRecord.id,
  };
}

async function executePlaceBidTransactionWithRetry(
  prismaClient: PrismaClient,
  input: PlaceBidTransactionInput,
): Promise<TransactionResult> {
  let attempt = 0;

  while (attempt < 2) {
    try {
      return await prismaClient.$transaction(
        (tx) =>
          executeTransactionAttempt(tx, input, attempt === 0),
        {
          isolationLevel: "Serializable",
        },
      );
    } catch (error) {
      if (error instanceof RetryableOptimisticConflictError && attempt === 0) {
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  return rejection("BID_OPTIMISTIC_CONFLICT", 409);
}

export async function executePlaceBidCommand(
  prismaClient: PrismaClient,
  input: ExecutePlaceBidCommandInput,
): Promise<BidRequestResponseResult> {
  const occurredAt = new Date();
  const normalizedAmount = normalizeBidAmount(input.amount);
  const requestHash = buildBidRequestHash({
    auctionId: input.auctionId,
    companyId: input.companyId,
    userId: input.userId,
    amount: normalizedAmount,
  });
  const replayResult = await handleBidRequestReplay(prismaClient, {
    auctionId: input.auctionId,
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    requestHash,
  });

  if (replayResult !== null) {
    return replayResult;
  }

  let bidRequestId: string | null = null;

  try {
    const createdBidRequest = await createInProgressBidRequest(prismaClient, {
      auctionId: input.auctionId,
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      occurredAt,
    });

    bidRequestId = createdBidRequest?.id ?? null;
  } catch {
    const racedReplayResult = await handleBidRequestReplay(prismaClient, {
      auctionId: input.auctionId,
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });

    if (racedReplayResult !== null) {
      return racedReplayResult;
    }

    return {
      kind: "rejected",
      statusCode: 409,
      body: {
        error: "BID_REQUEST_IN_PROGRESS",
      },
      bidId: null,
    };
  }

  if (!bidRequestId) {
    return {
      kind: "rejected",
      statusCode: 500,
      body: {
        error: "INTERNAL_ERROR",
      },
      bidId: null,
    };
  }

  try {
    const transactionResult = await executePlaceBidTransactionWithRetry(prismaClient, {
      bidRequestId,
      auctionId: input.auctionId,
      companyId: input.companyId,
      userId: input.userId,
      amount: normalizedAmount,
      idempotencyKey: input.idempotencyKey,
      occurredAt,
    });

    if (transactionResult.kind === "success") {
      return {
        kind: "success",
        statusCode: transactionResult.statusCode,
        body: transactionResult.body,
        bidId: transactionResult.bidId,
      };
    }

    return {
      kind: "rejected",
      statusCode: transactionResult.statusCode,
      body: transactionResult.body,
      bidId: null,
    };
  } catch (error) {
    await prismaClient.bidRequest.update({
      where: {
        id: bidRequestId,
      },
      data: {
        status: "FAILED",
        responseStatus: 500,
        responseBody: toStoredJson({
          error: "INTERNAL_ERROR",
        }),
      },
    });

    return {
      kind: "rejected",
      statusCode: 500,
      body: {
        error: "INTERNAL_ERROR",
      },
      bidId: null,
    };
  }
}
