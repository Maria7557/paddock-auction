import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AuditCreateArgs = {
  data: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    payloadHash: string;
    payload: unknown;
  };
};

type TransitionCreateArgs = {
  data: {
    auctionId: string;
    fromState: string;
    toState: string;
    trigger: string;
    reason: string;
    actorId: string;
  };
};

const { mockPrisma, mockTx, MockRedis, resetRedis } = vi.hoisted(() => {
  class MockRedis {
    static published: Array<{ channel: string; payload: string }> = [];

    constructor(
      readonly url?: string,
      readonly options?: Record<string, unknown>,
    ) {}

    on(): this {
      return this;
    }

    async publish(channel: string, payload: string): Promise<number> {
      MockRedis.published.push({ channel, payload });
      return 1;
    }
  }

  const mockTx = {
    auctionEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auctionEventLot: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auctionEventRuntime: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auction: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bid: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    auctionStateTransition: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
    auctionEventRuntime: {
      findUnique: vi.fn(),
    },
    auctionEventLot: {
      findUnique: vi.fn(),
    },
    bid: {
      count: vi.fn(),
    },
  };

  return {
    mockPrisma,
    mockTx,
    MockRedis,
    resetRedis: () => {
      MockRedis.published = [];
    },
  };
});

const { mockCloseAuction } = vi.hoisted(() => ({
  mockCloseAuction: {
    collectAuctionCloseBuyingPowerOutcome: vi.fn(),
    releaseBuyingPowerForClosedAuction: vi.fn(),
  },
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));
vi.mock("../../modules/auction/application/close_auction", () => ({
  collectAuctionCloseBuyingPowerOutcome: mockCloseAuction.collectAuctionCloseBuyingPowerOutcome,
  releaseBuyingPowerForClosedAuction: mockCloseAuction.releaseBuyingPowerForClosedAuction,
}));

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

import {
  advanceToNextLot,
  checkAndTick,
  closeEvent,
  escalateCallRound,
  startEvent,
} from "../event-orchestrator";

function makeEvent(
  overrides: Partial<{
    id: string;
    title: string;
    state: "SCHEDULED" | "LIVE" | "CLOSED";
    scheduledAt: Date;
    startsAt: Date | null;
    endsAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "event-1",
    title: overrides.title ?? "Weekly live lane",
    state: overrides.state ?? "SCHEDULED",
    scheduledAt: overrides.scheduledAt ?? new Date("2026-03-20T08:00:00.000Z"),
    startsAt: overrides.startsAt ?? null,
    endsAt: overrides.endsAt ?? null,
  };
}

function makeLot(
  overrides: Partial<{
    id: string;
    eventId: string;
    auctionId: string;
    position: number;
    state:
      | "QUEUED"
      | "ON_BLOCK"
      | "LAST_CHANCE_1"
      | "LAST_CHANCE_2"
      | "SOLD"
      | "UNSOLD"
      | "CLOSED";
    callRound: number;
    onBlockAt: Date | null;
    closedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "lot-1",
    eventId: overrides.eventId ?? "event-1",
    auctionId: overrides.auctionId ?? "auction-1",
    position: overrides.position ?? 0,
    state: overrides.state ?? "QUEUED",
    callRound: overrides.callRound ?? 0,
    onBlockAt: overrides.onBlockAt ?? null,
    closedAt: overrides.closedAt ?? null,
  };
}

function makeRuntime(
  overrides: Partial<{
    id: string;
    eventId: string;
    currentLotId: string | null;
    currentPosition: number;
    callEndsAt: Date | null;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? "runtime-1",
    eventId: overrides.eventId ?? "event-1",
    currentLotId: overrides.currentLotId ?? "lot-1",
    currentPosition: overrides.currentPosition ?? 0,
    callEndsAt: overrides.callEndsAt ?? new Date(Date.now() - 1_000),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-20T08:05:00.000Z"),
  };
}

function makeAuction(
  overrides: Partial<{
    id: string;
    state:
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
    startsAt: Date;
    endsAt: Date;
    currentPrice: number;
    highestBidId: string | null;
    winnerCompanyId: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "auction-1",
    state: overrides.state ?? "SCHEDULED",
    startsAt: overrides.startsAt ?? new Date("2026-03-20T08:00:00.000Z"),
    endsAt: overrides.endsAt ?? new Date("2026-03-20T09:00:00.000Z"),
    currentPrice: overrides.currentPrice ?? 25_000,
    highestBidId: overrides.highestBidId ?? null,
    winnerCompanyId: overrides.winnerCompanyId ?? null,
  };
}

function makeLeaderBid(
  overrides: Partial<{
    id: string;
    companyId: string;
    amount: number;
  }> = {},
) {
  return {
    id: overrides.id ?? "bid-1",
    companyId: overrides.companyId ?? "buyer-company-1",
    amount: overrides.amount ?? 25_000,
  };
}

function getLastPublishedMessage(): Record<string, unknown> {
  const published = MockRedis.published.at(-1);

  if (!published) {
    throw new Error("Expected a published redis message");
  }

  return JSON.parse(published.payload) as Record<string, unknown>;
}

beforeAll(() => {
  process.env.REDIS_URL = "redis://mock-redis:6379";
});

afterAll(() => {
  delete process.env.REDIS_URL;
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRedis();

  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
    callback(mockTx),
  );

  mockTx.auditLog.create.mockResolvedValue({});
  mockTx.auctionStateTransition.create.mockResolvedValue({});
  mockTx.auctionEvent.update.mockResolvedValue({});
  mockTx.auctionEventRuntime.upsert.mockResolvedValue({});
  mockTx.auctionEventRuntime.update.mockResolvedValue({});
  mockTx.auctionEventRuntime.updateMany.mockResolvedValue({ count: 1 });
  mockTx.auction.update.mockResolvedValue({});
  mockTx.bid.findFirst.mockResolvedValue(makeLeaderBid());
  mockPrisma.bid.count.mockResolvedValue(0);
  mockCloseAuction.collectAuctionCloseBuyingPowerOutcome.mockResolvedValue({
    auctionId: "auction-1",
    winningBidId: "bid-1",
    winnerCompanyId: "buyer-company-1",
    winningBidAmount: 25_000,
    losingCompanyIds: [],
    bidAmountsByCompany: new Map(),
    releasableLosingCompanyIds: [],
    releasableBidAmountsByCompany: new Map(),
  });
  mockCloseAuction.releaseBuyingPowerForClosedAuction.mockResolvedValue(undefined);
});

describe("event orchestrator", () => {
  it("startEvent sets event LIVE and first lot ON_BLOCK", async () => {
    mockTx.auctionEvent.findUnique.mockResolvedValue(makeEvent());
    mockTx.auctionEventLot.findFirst.mockResolvedValue(makeLot());
    mockTx.auctionEventLot.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      makeLot({
        id: where.id,
        state: String(data.state) as "ON_BLOCK",
        callRound: Number(data.callRound),
        onBlockAt: data.onBlockAt as Date,
      }),
    );
    mockTx.auction.findUnique.mockResolvedValue(makeAuction());

    await startEvent("event-1");

    expect(mockTx.auctionEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1" },
        data: expect.objectContaining({
          state: "LIVE",
        }),
      }),
    );
    expect(mockTx.auctionEventLot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lot-1" },
        data: expect.objectContaining({
          state: "ON_BLOCK",
          callRound: 0,
        }),
      }),
    );
    expect(mockTx.auctionEventRuntime.upsert).toHaveBeenCalled();
    expect(mockTx.auctionStateTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auctionId: "auction-1",
          toState: "LIVE",
        }),
      }),
    );

    const message = getLastPublishedMessage();
    expect(message.type).toBe("event.started");
    expect(message.eventId).toBe("event-1");
    expect(message.currentLot).toEqual(
      expect.objectContaining({
        id: "lot-1",
        state: "ON_BLOCK",
      }),
    );
  });

  it("advanceToNextLot moves to next lot correctly", async () => {
    mockCloseAuction.collectAuctionCloseBuyingPowerOutcome.mockResolvedValueOnce({
      auctionId: "auction-1",
      winningBidId: "bid-1",
      winnerCompanyId: "buyer-company-1",
      winningBidAmount: 31_500,
      losingCompanyIds: [],
      bidAmountsByCompany: new Map(),
      releasableLosingCompanyIds: [],
      releasableBidAmountsByCompany: new Map(),
    });
    mockTx.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockTx.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK" }));
    mockTx.bid.count.mockResolvedValue(3);
    mockTx.bid.findFirst.mockResolvedValue(makeLeaderBid({ amount: 31_500 }));
    mockTx.auction.findUnique
      .mockResolvedValueOnce(makeAuction({ id: "auction-1", state: "LIVE", currentPrice: 31_500 }))
      .mockResolvedValueOnce(makeAuction({ id: "auction-2", state: "SCHEDULED", currentPrice: 0 }));
    mockTx.auctionEventLot.findFirst.mockResolvedValue(
      makeLot({
        id: "lot-2",
        auctionId: "auction-2",
        position: 1,
      }),
    );
    mockTx.auctionEventLot.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        makeLot({
          id: where.id,
          auctionId: where.id === "lot-2" ? "auction-2" : "auction-1",
          position: where.id === "lot-2" ? 1 : 0,
          state: String(data.state) as
            | "SOLD"
            | "ON_BLOCK",
          callRound: Number(data.callRound ?? 0),
          onBlockAt: (data.onBlockAt as Date | undefined) ?? null,
          closedAt: (data.closedAt as Date | undefined) ?? null,
        }),
    );

    await advanceToNextLot("event-1");

    expect(mockTx.auctionEventRuntime.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "event-1" },
        data: expect.objectContaining({
          currentLotId: "lot-2",
          currentPosition: 1,
        }),
      }),
    );
    expect(mockTx.auction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "auction-1" },
        data: expect.objectContaining({
          state: "AWAITING_SELLER_DECISION",
          winnerCompanyId: "buyer-company-1",
          decisionDeadlineAt: expect.any(Date),
        }),
      }),
    );

    const message = getLastPublishedMessage();
    expect(message.type).toBe("lot.advanced");
    expect(message.currentLot).toEqual(
      expect.objectContaining({
        id: "lot-2",
        state: "ON_BLOCK",
      }),
    );
    expect(message.previousLot).toEqual(
      expect.objectContaining({
        id: "lot-1",
        state: "SOLD",
        soldAmount: 31_500,
      }),
    );
  });

  it("advanceToNextLot calls closeEvent when no next lot", async () => {
    mockTx.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockTx.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK" }));
    mockTx.bid.count.mockResolvedValue(0);
    mockTx.auction.findUnique
      .mockResolvedValueOnce(makeAuction({ id: "auction-1", state: "LIVE", currentPrice: 0 }))
      .mockResolvedValueOnce(makeEvent({ id: "event-1", state: "LIVE" }));
    mockTx.auctionEventLot.findFirst.mockResolvedValue(null);
    mockTx.auctionEvent.update.mockResolvedValue({});

    await advanceToNextLot("event-1");

    expect(mockTx.auctionEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1" },
        data: expect.objectContaining({
          state: "CLOSED",
        }),
      }),
    );

    const message = getLastPublishedMessage();
    expect(message.type).toBe("event.closed");
    expect(message.eventId).toBe("event-1");
  });

  it("escalateCallRound increments callRound 0→1→2→UNSOLD", async () => {
    mockTx.auctionEventRuntime.findUnique
      .mockResolvedValueOnce(makeRuntime())
      .mockResolvedValueOnce(makeRuntime())
      .mockResolvedValueOnce(makeRuntime())
      .mockResolvedValueOnce(makeRuntime({ currentPosition: 0 }));
    mockTx.auctionEventLot.findUnique
      .mockResolvedValueOnce(makeLot({ state: "ON_BLOCK", callRound: 0 }))
      .mockResolvedValueOnce(makeLot({ state: "LAST_CHANCE_1", callRound: 1 }))
      .mockResolvedValueOnce(makeLot({ state: "LAST_CHANCE_2", callRound: 2 }))
      .mockResolvedValueOnce(makeLot({ state: "UNSOLD", callRound: 2 }))
      .mockResolvedValueOnce(makeLot({ id: "lot-2", auctionId: "auction-2", position: 1, state: "QUEUED" }));
    mockTx.auctionEventLot.findFirst.mockResolvedValue(
      makeLot({
        id: "lot-2",
        auctionId: "auction-2",
        position: 1,
        state: "QUEUED",
      }),
    );
    mockTx.auctionEventLot.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        makeLot({
          id: where.id,
          auctionId: where.id === "lot-2" ? "auction-2" : "auction-1",
          position: where.id === "lot-2" ? 1 : 0,
          state: String(data.state ?? "ON_BLOCK") as
            | "LAST_CHANCE_1"
            | "LAST_CHANCE_2"
            | "UNSOLD"
            | "ON_BLOCK",
          callRound: Number(data.callRound ?? 0),
          onBlockAt: (data.onBlockAt as Date | undefined) ?? null,
          closedAt: (data.closedAt as Date | undefined) ?? null,
        }),
    );
    mockTx.bid.count.mockResolvedValue(0);
    mockTx.auction.findUnique
      .mockResolvedValueOnce(makeAuction({ id: "auction-1", state: "LIVE", currentPrice: 0 }))
      .mockResolvedValueOnce(makeAuction({ id: "auction-2", state: "SCHEDULED", currentPrice: 0 }));

    await escalateCallRound("event-1");
    let message = getLastPublishedMessage();
    expect(message.type).toBe("lot.call_round");
    expect(message.callRound).toBe(1);

    await escalateCallRound("event-1");
    message = getLastPublishedMessage();
    expect(message.type).toBe("lot.call_round");
    expect(message.callRound).toBe(2);

    await escalateCallRound("event-1");
    message = getLastPublishedMessage();
    expect(message.type).toBe("lot.advanced");
    expect(message.previousLot).toEqual(
      expect.objectContaining({
        state: "UNSOLD",
        bidCount: 0,
      }),
    );
  });

  it("checkAndTick advances lot when bids > 0 and time passed", async () => {
    mockCloseAuction.collectAuctionCloseBuyingPowerOutcome.mockResolvedValueOnce({
      auctionId: "auction-1",
      winningBidId: "bid-1",
      winnerCompanyId: "buyer-company-1",
      winningBidAmount: 44_000,
      losingCompanyIds: [],
      bidAmountsByCompany: new Map(),
      releasableLosingCompanyIds: [],
      releasableBidAmountsByCompany: new Map(),
    });
    mockPrisma.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockPrisma.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK" }));
    mockPrisma.bid.count.mockResolvedValue(2);

    mockTx.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockTx.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK" }));
    mockTx.bid.count.mockResolvedValue(2);
    mockTx.bid.findFirst.mockResolvedValue(makeLeaderBid({ amount: 44_000 }));
    mockTx.auction.findUnique
      .mockResolvedValueOnce(makeAuction({ id: "auction-1", state: "LIVE", currentPrice: 44_000 }))
      .mockResolvedValueOnce(makeAuction({ id: "auction-2", state: "SCHEDULED", currentPrice: 0 }));
    mockTx.auctionEventLot.findFirst.mockResolvedValue(
      makeLot({
        id: "lot-2",
        auctionId: "auction-2",
        position: 1,
        state: "QUEUED",
      }),
    );
    mockTx.auctionEventLot.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        makeLot({
          id: where.id,
          auctionId: where.id === "lot-2" ? "auction-2" : "auction-1",
          position: where.id === "lot-2" ? 1 : 0,
          state: String(data.state ?? "ON_BLOCK") as
            | "SOLD"
            | "ON_BLOCK",
          callRound: Number(data.callRound ?? 0),
          onBlockAt: (data.onBlockAt as Date | undefined) ?? null,
          closedAt: (data.closedAt as Date | undefined) ?? null,
        }),
    );

    await checkAndTick("event-1");

    const message = getLastPublishedMessage();
    expect(message.type).toBe("lot.advanced");
    expect(message.previousLot).toEqual(
      expect.objectContaining({
        soldAmount: 44_000,
      }),
    );
  });

  it("checkAndTick escalates when bids === 0 and time passed", async () => {
    mockPrisma.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockPrisma.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK", callRound: 0 }));
    mockPrisma.bid.count.mockResolvedValue(0);

    mockTx.auctionEventRuntime.findUnique.mockResolvedValue(makeRuntime());
    mockTx.auctionEventLot.findUnique.mockResolvedValue(makeLot({ state: "ON_BLOCK", callRound: 0 }));
    mockTx.auctionEventLot.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        makeLot({
          id: where.id,
          state: String(data.state ?? "LAST_CHANCE_1") as "LAST_CHANCE_1",
          callRound: Number(data.callRound ?? 1),
        }),
    );

    await checkAndTick("event-1");

    const message = getLastPublishedMessage();
    expect(message.type).toBe("lot.call_round");
    expect(message.callRound).toBe(1);
  });

  it("closeEvent sets CLOSED and publishes event.closed", async () => {
    mockTx.auctionEvent.findUnique.mockResolvedValue(makeEvent({ state: "LIVE" }));

    await closeEvent("event-1");

    expect(mockTx.auctionEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1" },
        data: expect.objectContaining({
          state: "CLOSED",
        }),
      }),
    );
    expect(mockTx.auctionEventRuntime.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "event-1" },
        data: expect.objectContaining({
          currentLotId: null,
          callEndsAt: null,
        }),
      }),
    );

    const message = getLastPublishedMessage();
    expect(message.type).toBe("event.closed");
    expect(message.eventId).toBe("event-1");
  });
});
