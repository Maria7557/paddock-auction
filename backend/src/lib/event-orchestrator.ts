import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import Redis from "ioredis";

import { prisma } from "../db";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

type AuctionStateValue =
  | "DRAFT"
  | "SCHEDULED"
  | "LIVE"
  | "EXTENDED"
  | "CLOSED"
  | "AWAITING_SELLER_DECISION"
  | "PAYMENT_PENDING"
  | "PAID"
  | "DEFAULTED"
  | "CANCELED"
  | "RELISTED"
  | "ENDED";

type AuctionEventStateValue = "SCHEDULED" | "LIVE" | "CLOSED";
type EventLotStateValue =
  | "QUEUED"
  | "ON_BLOCK"
  | "LAST_CHANCE_1"
  | "LAST_CHANCE_2"
  | "SOLD"
  | "UNSOLD"
  | "CLOSED";

type AuctionEventRecord = {
  id: string;
  title: string;
  state: AuctionEventStateValue;
  scheduledAt: Date;
  startsAt: Date | null;
  endsAt: Date | null;
};

type AuctionEventLotRecord = {
  id: string;
  eventId: string;
  auctionId: string;
  position: number;
  state: EventLotStateValue;
  callRound: number;
  onBlockAt: Date | null;
  closedAt: Date | null;
};

type AuctionEventRuntimeRecord = {
  id: string;
  eventId: string;
  currentLotId: string | null;
  currentPosition: number;
  callEndsAt: Date | null;
  updatedAt: Date;
};

type AuctionRecord = {
  id: string;
  state: AuctionStateValue;
  startsAt: Date;
  endsAt: Date;
  currentPrice: DecimalLike;
  highestBidId: string | null;
  winnerCompanyId: string | null;
};

type LeaderBidRecord = {
  id: string;
  companyId: string;
  amount: DecimalLike;
};

type PublishPayload =
  | {
      type: "event.started";
      eventId: string;
      currentLot: PublishedLot;
    }
  | {
      type: "lot.advanced";
      eventId: string;
      currentLot: PublishedLot;
      previousLot: PublishedLot | null;
    }
  | {
      type: "lot.call_round";
      eventId: string;
      callRound: number;
      callEndsAt: string;
    }
  | {
      type: "event.closed";
      eventId: string;
    };

type PublishedLot = {
  id: string;
  auctionId: string;
  position: number;
  state: EventLotStateValue;
  callRound: number;
  bidCount: number;
  soldAmount: number | null;
  winnerCompanyId: string | null;
};

type FinalizedLot = PublishedLot;

type AuditClient = {
  auditLog: {
    create: (args: {
      data: {
        actorId: string;
        action: string;
        entityType: string;
        entityId: string;
        payload: Prisma.InputJsonValue;
        payloadHash: string;
      };
    }) => Promise<unknown>;
  };
};

type TransitionClient = {
  auctionStateTransition: {
    create: (args: {
      data: {
        auctionId: string;
        fromState: AuctionStateValue;
        toState: AuctionStateValue;
        trigger: string;
        reason: string;
        actorId: string;
      };
    }) => Promise<unknown>;
  };
};

type OrchestratorTx = Prisma.TransactionClient;

const CALL_DURATION_MS = 20_000;
const LAST_CHANCE_DURATION_MS = 10_000;
const orchestratorActorId = "system:event-orchestrator";
const EVENT_CHANNEL_PREFIX = "event:live:";

let redisPublisher: Redis | null = null;

function getRedisUrl(): string | null {
  const value = process.env.REDIS_URL?.trim();

  return value ? value : null;
}

function getRedisPublisher(): Redis | null {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (redisPublisher) {
    return redisPublisher;
  }

  redisPublisher = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: null,
  });

  redisPublisher.on("error", () => {
    // Realtime publishes are best-effort and must never break the orchestrator.
  });

  return redisPublisher;
}

function buildEventChannel(eventId: string): string {
  return `${EVENT_CHANNEL_PREFIX}${eventId}`;
}

function publishEventUpdate(eventId: string, payload: PublishPayload): void {
  const publisher = getRedisPublisher();

  if (!publisher) {
    return;
  }

  void publisher.publish(buildEventChannel(eventId), JSON.stringify(payload)).catch(() => {
    // Non-blocking best-effort publish.
  });
}

function toStoredJson(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function createPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function createAuditLog(
  tx: AuditClient,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    payload: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: orchestratorActorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: toStoredJson(input.payload),
      payloadHash: createPayloadHash(input.payload),
    },
  });
}

async function createAuctionTransition(
  tx: TransitionClient,
  input: {
    auctionId: string;
    fromState: AuctionStateValue;
    toState: AuctionStateValue;
    trigger: string;
    reason: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auctionStateTransition.create({
    data: {
      auctionId: input.auctionId,
      fromState: input.fromState,
      toState: input.toState,
      trigger: input.trigger,
      reason: JSON.stringify(input.reason),
      actorId: orchestratorActorId,
    },
  });
}

function addMilliseconds(base: Date, milliseconds: number): Date {
  return new Date(base.getTime() + milliseconds);
}

function toNumberValue(value: DecimalLike): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const resolved = value.valueOf();

    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      return resolved;
    }

    if (typeof resolved === "string") {
      const parsed = Number(resolved);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

function mapCallRoundToState(callRound: number): EventLotStateValue {
  if (callRound >= 2) {
    return "LAST_CHANCE_2";
  }

  if (callRound >= 1) {
    return "LAST_CHANCE_1";
  }

  return "ON_BLOCK";
}

function ensurePresent<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }

  return value;
}

function buildPublishedLot(
  lot: AuctionEventLotRecord,
  bidCount: number,
  soldAmount: number | null,
  winnerCompanyId: string | null,
): PublishedLot {
  return {
    id: lot.id,
    auctionId: lot.auctionId,
    position: lot.position,
    state: lot.state,
    callRound: lot.callRound,
    bidCount,
    soldAmount,
    winnerCompanyId,
  };
}

async function loadAuction(tx: OrchestratorTx, auctionId: string): Promise<AuctionRecord> {
  const auction = await tx.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true,
      state: true,
      startsAt: true,
      endsAt: true,
      currentPrice: true,
      highestBidId: true,
      winnerCompanyId: true,
    },
  });

  return ensurePresent(auction, `Auction ${auctionId} not found`);
}

async function loadLeaderBid(tx: OrchestratorTx, auctionId: string): Promise<LeaderBidRecord | null> {
  return tx.bid.findFirst({
    where: { auctionId },
    orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      companyId: true,
      amount: true,
    },
  });
}

async function finalizeLotIfNeeded(
  tx: OrchestratorTx,
  lot: AuctionEventLotRecord | null,
  now: Date,
): Promise<FinalizedLot | null> {
  if (!lot) {
    return null;
  }

  const bidCount = await tx.bid.count({
    where: { auctionId: lot.auctionId },
  });
  const leaderBid = bidCount > 0 ? await loadLeaderBid(tx, lot.auctionId) : null;
  const soldAmount = leaderBid ? toNumberValue(leaderBid.amount) : null;
  const winnerCompanyId = leaderBid?.companyId ?? null;
  const targetEventLotState: EventLotStateValue = leaderBid ? "SOLD" : "UNSOLD";
  const targetAuctionState: AuctionStateValue = leaderBid ? "PAYMENT_PENDING" : "ENDED";

  let nextLotRecord = lot;

  if (lot.state !== "SOLD" && lot.state !== "UNSOLD" && lot.state !== "CLOSED") {
    nextLotRecord = await tx.auctionEventLot.update({
      where: { id: lot.id },
      data: {
        state: targetEventLotState,
        closedAt: now,
      },
    });
  }

  const auction = await loadAuction(tx, lot.auctionId);

  if (auction.state !== targetAuctionState) {
    await tx.auction.update({
      where: { id: lot.auctionId },
      data: {
        state: targetAuctionState,
        highestBidId: leaderBid?.id ?? auction.highestBidId,
        winnerCompanyId,
        closedAt: now,
      },
    });

    await createAuctionTransition(tx, {
      auctionId: lot.auctionId,
      fromState: auction.state,
      toState: targetAuctionState,
      trigger: "event_orchestrator_finalize_lot",
      reason: {
        eventLotId: lot.id,
        bidCount,
        winnerCompanyId,
      },
    });
  }

  await createAuditLog(tx, {
    action: leaderBid ? "AUCTION_EVENT_LOT_SOLD" : "AUCTION_EVENT_LOT_UNSOLD",
    entityType: "AuctionEventLot",
    entityId: lot.id,
    payload: {
      eventId: lot.eventId,
      auctionId: lot.auctionId,
      bidCount,
      soldAmount,
      winnerCompanyId,
    },
  });

  return buildPublishedLot(
    {
      ...nextLotRecord,
      state: targetEventLotState,
    },
    bidCount,
    soldAmount,
    winnerCompanyId,
  );
}

async function closeEventInTransaction(
  tx: OrchestratorTx,
  eventId: string,
  now: Date,
): Promise<void> {
  const event = await tx.auctionEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      state: true,
    },
  });

  const resolvedEvent = ensurePresent(event, `Auction event ${eventId} not found`);

  await tx.auctionEvent.update({
    where: { id: eventId },
    data: {
      state: "CLOSED",
      endsAt: now,
    },
  });

  await tx.auctionEventRuntime.updateMany({
    where: { eventId },
    data: {
      currentLotId: null,
      callEndsAt: null,
    },
  });

  await createAuditLog(tx, {
    action: "AUCTION_EVENT_CLOSED",
    entityType: "AuctionEvent",
    entityId: eventId,
    payload: {
      previousState: resolvedEvent.state,
      closedAt: now.toISOString(),
    },
  });
}

export async function startEvent(eventId: string): Promise<void> {
  const now = new Date();
  const callEndsAt = addMilliseconds(now, CALL_DURATION_MS);

  const payload = await prisma.$transaction(async (tx) => {
    const event = await tx.auctionEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        state: true,
        scheduledAt: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const resolvedEvent = ensurePresent(event, `Auction event ${eventId} not found`);

    if (resolvedEvent.state !== "SCHEDULED") {
      throw new Error(`Auction event ${eventId} is not scheduled`);
    }

    const firstLot = await tx.auctionEventLot.findFirst({
      where: {
        eventId,
        position: 0,
      },
      orderBy: {
        position: "asc",
      },
    });

    const resolvedFirstLot = ensurePresent(firstLot, `Auction event ${eventId} has no first lot`);

    await tx.auctionEvent.update({
      where: { id: eventId },
      data: {
        state: "LIVE",
        startsAt: now,
      },
    });

    const onBlockLot = await tx.auctionEventLot.update({
      where: { id: resolvedFirstLot.id },
      data: {
        state: "ON_BLOCK",
        callRound: 0,
        onBlockAt: now,
      },
    });

    const firstAuction = await loadAuction(tx, resolvedFirstLot.auctionId);

    if (firstAuction.state !== "LIVE") {
      await tx.auction.update({
        where: { id: resolvedFirstLot.auctionId },
        data: {
          state: "LIVE",
          startsAt: now,
        },
      });

      await createAuctionTransition(tx, {
        auctionId: resolvedFirstLot.auctionId,
        fromState: firstAuction.state,
        toState: "LIVE",
        trigger: "event_orchestrator_start_event",
        reason: {
          eventId,
          position: onBlockLot.position,
        },
      });
    }

    await tx.auctionEventRuntime.upsert({
      where: { eventId },
      create: {
        eventId,
        currentLotId: onBlockLot.id,
        currentPosition: onBlockLot.position,
        callEndsAt,
      },
      update: {
        currentLotId: onBlockLot.id,
        currentPosition: onBlockLot.position,
        callEndsAt,
      },
    });

    await createAuditLog(tx, {
      action: "AUCTION_EVENT_STARTED",
      entityType: "AuctionEvent",
      entityId: eventId,
      payload: {
        scheduledAt: resolvedEvent.scheduledAt.toISOString(),
        startsAt: now.toISOString(),
        currentLotId: onBlockLot.id,
        currentPosition: onBlockLot.position,
      },
    });

    return {
      type: "event.started" as const,
      eventId,
      currentLot: buildPublishedLot(onBlockLot, 0, null, null),
    };
  }, {
    isolationLevel: "Serializable",
  });

  publishEventUpdate(eventId, payload);
}

export async function advanceToNextLot(eventId: string): Promise<void> {
  const now = new Date();
  const callEndsAt = addMilliseconds(now, CALL_DURATION_MS);

  const result = await prisma.$transaction(async (tx) => {
    const runtime = await tx.auctionEventRuntime.findUnique({
      where: { eventId },
      select: {
        id: true,
        eventId: true,
        currentLotId: true,
        currentPosition: true,
        callEndsAt: true,
        updatedAt: true,
      },
    });

    const resolvedRuntime = ensurePresent(runtime, `Auction event runtime ${eventId} not found`);

    const currentLot = resolvedRuntime.currentLotId
      ? await tx.auctionEventLot.findUnique({
          where: { id: resolvedRuntime.currentLotId },
        })
      : null;

    const previousLot = await finalizeLotIfNeeded(tx, currentLot, now);

    const nextLot = await tx.auctionEventLot.findFirst({
      where: {
        eventId,
        position: resolvedRuntime.currentPosition + 1,
        state: "QUEUED",
      },
      orderBy: {
        position: "asc",
      },
    });

    if (!nextLot) {
      await closeEventInTransaction(tx, eventId, now);

      return {
        type: "closed" as const,
      };
    }

    const nextOnBlockLot = await tx.auctionEventLot.update({
      where: { id: nextLot.id },
      data: {
        state: "ON_BLOCK",
        callRound: 0,
        onBlockAt: now,
      },
    });

    const nextAuction = await loadAuction(tx, nextLot.auctionId);

    if (nextAuction.state !== "LIVE") {
      await tx.auction.update({
        where: { id: nextLot.auctionId },
        data: {
          state: "LIVE",
          startsAt: now,
        },
      });

      await createAuctionTransition(tx, {
        auctionId: nextLot.auctionId,
        fromState: nextAuction.state,
        toState: "LIVE",
        trigger: "event_orchestrator_advance_to_next_lot",
        reason: {
          eventId,
          position: nextOnBlockLot.position,
          previousLotId: previousLot?.id ?? null,
        },
      });
    }

    await tx.auctionEventRuntime.update({
      where: { eventId },
      data: {
        currentLotId: nextOnBlockLot.id,
        currentPosition: nextOnBlockLot.position,
        callEndsAt,
      },
    });

    await createAuditLog(tx, {
      action: "AUCTION_EVENT_LOT_ADVANCED",
      entityType: "AuctionEvent",
      entityId: eventId,
      payload: {
        previousLot,
        currentLotId: nextOnBlockLot.id,
        currentPosition: nextOnBlockLot.position,
        callEndsAt: callEndsAt.toISOString(),
      },
    });

    return {
      type: "advanced" as const,
      currentLot: buildPublishedLot(nextOnBlockLot, 0, null, null),
      previousLot,
    };
  }, {
    isolationLevel: "Serializable",
  });

  if (result.type === "closed") {
    publishEventUpdate(eventId, {
      type: "event.closed",
      eventId,
    });
    return;
  }

  publishEventUpdate(eventId, {
    type: "lot.advanced",
    eventId,
    currentLot: result.currentLot,
    previousLot: result.previousLot,
  });
}

export async function escalateCallRound(eventId: string): Promise<void> {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const runtime = await tx.auctionEventRuntime.findUnique({
      where: { eventId },
      select: {
        id: true,
        eventId: true,
        currentLotId: true,
        currentPosition: true,
        callEndsAt: true,
        updatedAt: true,
      },
    });

    const resolvedRuntime = ensurePresent(runtime, `Auction event runtime ${eventId} not found`);
    const currentLot = ensurePresent(
      resolvedRuntime.currentLotId
        ? await tx.auctionEventLot.findUnique({
            where: { id: resolvedRuntime.currentLotId },
          })
        : null,
      `Auction event ${eventId} has no current lot`,
    );

    if (currentLot.callRound >= 2) {
      const finalizedLot = await finalizeLotIfNeeded(tx, currentLot, now);

      await createAuditLog(tx, {
        action: "AUCTION_EVENT_LOT_TIMED_OUT",
        entityType: "AuctionEventLot",
        entityId: currentLot.id,
        payload: {
          eventId,
          currentPosition: resolvedRuntime.currentPosition,
        },
      });

      return {
        type: "advance" as const,
        finalizedLot,
      };
    }

    const nextCallRound = currentLot.callRound + 1;
    const nextCallEndsAt = addMilliseconds(now, LAST_CHANCE_DURATION_MS);
    const nextState = mapCallRoundToState(nextCallRound);

    await tx.auctionEventLot.update({
      where: { id: currentLot.id },
      data: {
        callRound: nextCallRound,
        state: nextState,
      },
    });

    await tx.auctionEventRuntime.update({
      where: { eventId },
      data: {
        callEndsAt: nextCallEndsAt,
      },
    });

    await createAuditLog(tx, {
      action: "AUCTION_EVENT_CALL_ROUND_ESCALATED",
      entityType: "AuctionEventLot",
      entityId: currentLot.id,
      payload: {
        eventId,
        callRound: nextCallRound,
        callEndsAt: nextCallEndsAt.toISOString(),
      },
    });

    return {
      type: "call-round" as const,
      callRound: nextCallRound,
      callEndsAt: nextCallEndsAt,
    };
  }, {
    isolationLevel: "Serializable",
  });

  if (result.type === "advance") {
    await advanceToNextLot(eventId);
    return;
  }

  publishEventUpdate(eventId, {
    type: "lot.call_round",
    eventId,
    callRound: result.callRound,
    callEndsAt: result.callEndsAt.toISOString(),
  });
}

export async function checkAndTick(eventId: string): Promise<void> {
  const runtime = await prisma.auctionEventRuntime.findUnique({
    where: { eventId },
    select: {
      id: true,
      eventId: true,
      currentLotId: true,
      currentPosition: true,
      callEndsAt: true,
      updatedAt: true,
    },
  });

  if (!runtime?.currentLotId || !runtime.callEndsAt || runtime.callEndsAt.getTime() > Date.now()) {
    return;
  }

  const currentLot = await prisma.auctionEventLot.findUnique({
    where: { id: runtime.currentLotId },
    select: {
      id: true,
      eventId: true,
      auctionId: true,
      position: true,
      state: true,
      callRound: true,
      onBlockAt: true,
      closedAt: true,
    },
  });

  if (!currentLot) {
    return;
  }

  const bidCount = await prisma.bid.count({
    where: {
      auctionId: currentLot.auctionId,
    },
  });

  if (bidCount > 0) {
    await advanceToNextLot(eventId);
    return;
  }

  await escalateCallRound(eventId);
}

export async function closeEvent(eventId: string): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await closeEventInTransaction(tx, eventId, now);
  }, {
    isolationLevel: "Serializable",
  });

  publishEventUpdate(eventId, {
    type: "event.closed",
    eventId,
  });
}
