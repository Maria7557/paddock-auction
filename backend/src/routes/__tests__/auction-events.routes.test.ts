import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const { mockPrisma, MockRedis, resetMockRedis } = vi.hoisted(() => {
  const redisClients = new Set<{
    subscribedChannels: Set<string>;
    emit: (event: string, ...args: unknown[]) => number;
    disconnect: () => void;
  }>();

  class MockRedis {
    static published: Array<{ channel: string; payload: string }> = [];

    status = "wait";
    subscribedChannels = new Set<string>();
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    constructor() {
      redisClients.add(this);
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
      const handlers = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();

      handlers.add(handler);
      this.listeners.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: unknown[]): number {
      const handlers = [...(this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>())];

      for (const handler of handlers) {
        handler(...args);
      }

      return handlers.length;
    }

    async connect(): Promise<void> {
      this.status = "ready";
    }

    async subscribe(channel: string): Promise<number> {
      this.subscribedChannels.add(channel);
      return this.subscribedChannels.size;
    }

    async unsubscribe(channel: string): Promise<number> {
      this.subscribedChannels.delete(channel);
      return this.subscribedChannels.size;
    }

    async publish(channel: string, payload: string): Promise<number> {
      MockRedis.published.push({ channel, payload });

      let delivered = 0;

      for (const client of redisClients) {
        if (!client.subscribedChannels.has(channel)) {
          continue;
        }

        delivered += client.emit("message", channel, payload);
      }

      return delivered;
    }

    disconnect(): void {
      this.status = "end";
      this.subscribedChannels.clear();
      redisClients.delete(this);
    }

    async quit(): Promise<"OK"> {
      this.disconnect();
      return "OK";
    }
  }

  return {
    mockPrisma: {
      auctionEvent: {
        findUnique: vi.fn(),
      },
      auctionEventLot: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      auctionEventRuntime: {
        update: vi.fn(),
      },
      auction: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      auctionStateTransition: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn(),
    },
    MockRedis,
    resetMockRedis: (): void => {
      MockRedis.published = [];

      for (const client of [...redisClients]) {
        client.disconnect();
      }
    },
  };
});

const { mockEmail } = vi.hoisted(() => ({
  mockEmail: {
    sendNewEventAnnouncementEmail: vi.fn(),
  },
}));

const { mockStartEvent } = vi.hoisted(() => ({
  mockStartEvent: vi.fn(),
}));

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../lib/email", () => mockEmail);

vi.mock("../../lib/event-orchestrator", () => ({
  startEvent: mockStartEvent,
}));

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

import { buildServer } from "../../server";
import { closeAuctionRealtime } from "../auction-ws";
import { closeEventRuntimeRealtime, notifyEventRuntime } from "../auction-events";

const jwtSecret = "test-secret-32-chars-long-enough!!";
const adminUserId = randomUUID();
const eventId = "event-live-1";
const auctionId = "auction-live-1";

function makeAuctionRealtimeRecord(
  overrides: Partial<{
    id: string;
    state: string;
    currentPrice: number;
    minIncrement: number;
    startingPrice: number;
    buyNowPrice: number | null;
    startsAt: Date;
    endsAt: Date;
    extensionCount: number;
    highestBidId: string | null;
    totalBids: number;
    lastBidId: string;
    lastBidAmount: number;
    lastBidSequenceNo: number;
    lastBidCreatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? auctionId,
    state: overrides.state ?? "LIVE",
    currentPrice: overrides.currentPrice ?? 51_000,
    minIncrement: overrides.minIncrement ?? 500,
    startingPrice: overrides.startingPrice ?? 50_000,
    buyNowPrice: overrides.buyNowPrice ?? null,
    startsAt: overrides.startsAt ?? new Date("2026-03-20T09:00:00.000Z"),
    endsAt: overrides.endsAt ?? new Date("2026-03-20T10:00:00.000Z"),
    extensionCount: overrides.extensionCount ?? 0,
    highestBidId: overrides.highestBidId ?? "bid-live-1",
    _count: {
      bids: overrides.totalBids ?? 5,
    },
    bids: [
      {
        id: overrides.lastBidId ?? "bid-live-1",
        amount: overrides.lastBidAmount ?? 51_000,
        sequenceNo: overrides.lastBidSequenceNo ?? 5,
        createdAt: overrides.lastBidCreatedAt ?? new Date("2026-03-20T09:30:00.000Z"),
      },
    ],
  };
}

async function makeToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);

  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function connectEventSocket(path: string): Promise<{
  socket: WebSocket;
  nextMessage: () => Promise<Record<string, unknown>>;
}> {
  const queue: Record<string, unknown>[] = [];
  const waiters: Array<(message: Record<string, unknown>) => void> = [];

  const socket = new WebSocket(`${baseWsUrl}${path}`);

  socket.on("message", (payload) => {
    const raw = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
    const message = JSON.parse(raw) as Record<string, unknown>;
    const waiter = waiters.shift();

    if (waiter) {
      waiter(message);
      return;
    }

    queue.push(message);
  });

  await once(socket, "open");

  return {
    socket,
    nextMessage: async () => {
      const queuedMessage = queue.shift();

      if (queuedMessage) {
        return queuedMessage;
      }

      return new Promise<Record<string, unknown>>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}

let server: FastifyInstance;
let request: ReturnType<typeof supertest>;
let adminToken: string;
let buyerToken: string;
let sellerToken: string;
let baseWsUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_URL = "redis://mock-redis:6379";
  process.env.JWT_SECRET = jwtSecret;
  server = await buildServer();
  await server.ready();
  await server.listen({
    port: 0,
    host: "127.0.0.1",
  });

  const address = server.server.address() as AddressInfo | null;

  if (!address) {
    throw new Error("Route test server did not expose a listening address.");
  }

  baseWsUrl = `ws://127.0.0.1:${address.port}`;
  request = supertest(server.server);
  adminToken = await makeToken({
    userId: adminUserId,
    role: "ADMIN",
  });
  buyerToken = await makeToken({
    userId: "buyer-user-1",
    role: "BUYER",
    companyId: "buyer-company-1",
  });
  sellerToken = await makeToken({
    userId: "seller-user-1",
    role: "SELLER",
    companyId: "seller-company-1",
  });
});

afterAll(async () => {
  await server.close();
  await closeAuctionRealtime();
  await closeEventRuntimeRealtime();
  delete process.env.REDIS_URL;
  delete process.env.JWT_SECRET;
});

beforeEach(async () => {
  vi.resetAllMocks();
  resetMockRedis();
  await closeAuctionRealtime();
  await closeEventRuntimeRealtime();
  mockPrisma.auctionEvent.findUnique.mockResolvedValue(null);
  mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionRealtimeRecord());
  mockPrisma.auction.findFirst.mockResolvedValue({
    vehicleId: "vehicle-seed-1",
    sellerCompanyId: "seller-company-1",
    minIncrement: 500,
  });
  mockPrisma.auction.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([{ email: "buyer@example.com" }]);
  mockPrisma.auctionEventLot.findFirst.mockResolvedValue(null);
  mockPrisma.auctionEventLot.findUnique.mockResolvedValue(null);
  mockPrisma.auctionEventLot.findMany.mockResolvedValue([]);
  mockPrisma.auctionEventLot.create.mockResolvedValue({
    id: "event-lot-created",
    eventId,
    auctionId,
    position: 1,
    state: "QUEUED",
    callRound: 0,
    onBlockAt: null,
    closedAt: null,
  });
  mockPrisma.auctionEventLot.delete.mockResolvedValue({});
  mockPrisma.auctionEventLot.update.mockResolvedValue({});
  mockPrisma.auctionEventRuntime.update.mockResolvedValue({});
  mockPrisma.auction.update.mockResolvedValue({});
  mockPrisma.auctionStateTransition.create.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockStartEvent.mockResolvedValue(undefined);
});

describe("auction event routes", () => {
  it("GET /api/events/:id/runtime returns full snapshot for LIVE event", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      scheduledAt: new Date("2026-03-20T09:00:00.000Z"),
      state: "LIVE",
      runtime: {
        currentLotId: "event-lot-1",
        currentPosition: 0,
        callEndsAt: new Date("2026-03-20T09:05:00.000Z"),
      },
      lots: [
        {
          id: "event-lot-1",
          auctionId,
          position: 0,
          state: "ON_BLOCK",
          callRound: 0,
          onBlockAt: new Date("2026-03-20T09:04:40.000Z"),
          auction: {
            currentPrice: 51_000,
            startingPrice: 50_000,
            _count: {
              bids: 5,
            },
            vehicle: {
              brand: "BMW",
              model: "M4",
              year: 2024,
            },
          },
        },
        {
          id: "event-lot-2",
          auctionId: "auction-2",
          position: 1,
          state: "QUEUED",
          callRound: 0,
          onBlockAt: null,
          auction: {
            currentPrice: 60_500,
            startingPrice: 60_000,
            _count: {
              bids: 1,
            },
            vehicle: {
              brand: "Land Rover",
              model: "Range Rover Sport",
              year: 2025,
            },
          },
        },
      ],
    });

    const response = await request.get(`/api/events/${eventId}/runtime`);

    expect(response.status).toBe(200);
    expect(response.body.eventId).toBe(eventId);
    expect(response.body.state).toBe("LIVE");
    expect(response.body.currentLot.lotId).toBe("event-lot-1");
    expect(response.body.currentLot.snapshot.auctionId).toBe(auctionId);
    expect(response.body.totalLots).toBe(2);
    expect(response.body.completedLots).toBe(0);
    expect(response.body.upcomingLots).toEqual([
      {
        position: 1,
        auctionId: "auction-2",
        title: "2025 Land Rover Range Rover Sport",
        startingPrice: 60000,
        currentPrice: 60500,
        totalBids: 1,
      },
    ]);
  });

  it("GET /api/events/:id/runtime returns 404 for unknown event", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue(null);

    const response = await request.get("/api/events/missing/runtime");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_NOT_FOUND");
  });

  it("GET /api/events/:id/runtime returns SCHEDULED state before start", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      scheduledAt: new Date("2026-03-20T09:00:00.000Z"),
      state: "SCHEDULED",
      runtime: null,
      lots: [
        {
          id: "event-lot-2",
          auctionId: "auction-2",
          position: 0,
          state: "QUEUED",
          callRound: 0,
          onBlockAt: null,
          auction: {
            currentPrice: 60_000,
            startingPrice: 60_000,
            _count: {
              bids: 0,
            },
            vehicle: {
              brand: "Land Rover",
              model: "Range Rover Sport",
              year: 2025,
            },
          },
        },
      ],
    });

    const response = await request.get(`/api/events/${eventId}/runtime`);

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("SCHEDULED");
    expect(response.body.currentLot).toBeNull();
    expect(response.body.totalLots).toBe(1);
  });

  it("POST /api/admin/events creates event (admin auth)", async () => {
    const tx = {
      auction: {
        create: vi.fn().mockResolvedValue({
          id: "ev1",
        }),
      },
      auctionEvent: {
        create: vi.fn().mockResolvedValue({
          id: "ev1",
          title: "Prime Time Event",
          scheduledAt: new Date("2026-03-21T15:00:00.000Z"),
          state: "SCHEDULED",
        }),
      },
      auctionStateTransition: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await request
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prime Time Event",
        scheduledAt: "2026-03-21T15:00:00.000Z",
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("ev1");
    expect(response.body.event).toEqual({
      id: "ev1",
      title: "Prime Time Event",
      scheduledAt: "2026-03-21T15:00:00.000Z",
      state: "SCHEDULED",
    });
    expect(tx.auctionEvent.create).toHaveBeenCalledTimes(1);
  });

  it("POST /api/admin/events returns 403 for non-admin", async () => {
    const response = await request
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        title: "Blocked Event",
        scheduledAt: "2026-03-21T15:00:00.000Z",
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden");
  });

  it("POST /api/admin/events/:id/lots adds lot to queue", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      scheduledAt: new Date("2026-03-21T15:00:00.000Z"),
    });
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: auctionId,
      state: "DRAFT",
    });
    mockPrisma.auctionEventLot.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const tx = {
      auctionEventLot: {
        create: vi.fn().mockResolvedValue({
          id: "event-lot-created",
          eventId,
          auctionId,
          position: 1,
          state: "QUEUED",
          callRound: 0,
          onBlockAt: null,
          closedAt: null,
        }),
      },
      auction: {
        update: vi.fn().mockResolvedValue({}),
      },
      auctionStateTransition: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await request
      .post(`/api/admin/events/${eventId}/lots`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        auctionId,
        position: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("event-lot-created");
    expect(response.body.position).toBe(1);
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: {
        id: auctionId,
      },
      data: {
        state: "SCHEDULED",
        startsAt: new Date("2026-03-21T15:00:00.000Z"),
        endsAt: new Date("2026-03-21T17:00:00.000Z"),
        auctionStartsAt: null,
        auctionEndsAt: null,
      },
    });
    expect(tx.auctionStateTransition.create).toHaveBeenCalledWith({
      data: {
        auctionId,
        fromState: "DRAFT",
        toState: "SCHEDULED",
        trigger: "EVENT_ASSIGNED",
        actorId: adminUserId,
        reason: JSON.stringify({ eventId }),
      },
    });
  });

  it("GET /api/admin/events/:id/lots includes DRAFT lots in available list", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      title: "Test Event",
      scheduledAt: new Date("2026-03-21T15:00:00.000Z"),
      state: "SCHEDULED",
      lots: [],
    });
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "draft-auction-1",
        startingPrice: 12_000,
        vehicle: {
          brand: "Land Rover",
          model: "Range Rover Sport",
          year: 2025,
          images: ["/api/seller/vehicles/media/1/photo.jpg"],
        },
      },
    ]);

    const response = await request
      .get(`/api/admin/events/${eventId}/lots`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.availableAuctions).toEqual([
      {
        auctionId: "draft-auction-1",
        title: "2025 Land Rover Range Rover Sport",
        startingPrice: 12000,
        imageUrl: "/api/seller/vehicles/media/1/photo.jpg",
      },
    ]);
  });

  it("GET /api/admin/events/:id/lots deduplicates available lots by vehicle", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      title: "Test Event",
      scheduledAt: new Date("2026-03-21T15:00:00.000Z"),
      state: "SCHEDULED",
      lots: [],
    });
    mockPrisma.auction.findMany.mockResolvedValue([
      {
        id: "auction-newer",
        vehicleId: "vehicle-1",
        startingPrice: 15_000,
        startsAt: new Date("2026-03-22T09:00:00.000Z"),
        vehicle: {
          brand: "Mercedes",
          model: "C 300",
          year: 2024,
          images: ["/api/seller/vehicles/media/newer.jpg"],
        },
      },
      {
        id: "auction-older",
        vehicleId: "vehicle-1",
        startingPrice: 14_000,
        startsAt: new Date("2026-03-21T09:00:00.000Z"),
        vehicle: {
          brand: "Mercedes",
          model: "C 300",
          year: 2024,
          images: ["/api/seller/vehicles/media/older.jpg"],
        },
      },
      {
        id: "auction-other-vehicle",
        vehicleId: "vehicle-2",
        startingPrice: 18_000,
        startsAt: new Date("2026-03-23T09:00:00.000Z"),
        vehicle: {
          brand: "Land Rover",
          model: "Range Rover Sport",
          year: 2025,
          images: ["/api/seller/vehicles/media/range-rover.jpg"],
        },
      },
    ]);

    const response = await request
      .get(`/api/admin/events/${eventId}/lots`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.availableAuctions).toEqual([
      {
        auctionId: "auction-newer",
        title: "2024 Mercedes C 300",
        startingPrice: 15000,
        imageUrl: "/api/seller/vehicles/media/newer.jpg",
      },
      {
        auctionId: "auction-other-vehicle",
        title: "2025 Land Rover Range Rover Sport",
        startingPrice: 18000,
        imageUrl: "/api/seller/vehicles/media/range-rover.jpg",
      },
    ]);
  });

  it("POST /api/admin/events/:id/lots rejects duplicate auctionId", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      state: "SCHEDULED",
      scheduledAt: new Date("2026-03-21T15:00:00.000Z"),
    });
    mockPrisma.auction.findUnique.mockResolvedValue({
      id: auctionId,
      state: "DRAFT",
      vehicleId: "vehicle-1",
    });
    mockPrisma.auctionEventLot.findFirst
      .mockResolvedValueOnce({
        id: "duplicate-lot",
      })
      .mockResolvedValueOnce(null);

    const response = await request
      .post(`/api/admin/events/${eventId}/lots`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        auctionId,
        position: 1,
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("VEHICLE_ALREADY_IN_EVENT");
  });

  it("DELETE /api/admin/events/:id/lots/:lotId removes queued lot and unassigns auction", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      state: "SCHEDULED",
    });
    mockPrisma.auctionEventLot.findUnique.mockResolvedValue({
      id: "event-lot-1",
      eventId,
      state: "QUEUED",
      position: 1,
      auctionId,
      auction: {
        id: auctionId,
        state: "SCHEDULED",
        startsAt: new Date("2026-03-21T15:00:00.000Z"),
        endsAt: new Date("2026-03-21T15:20:00.000Z"),
        auctionStartsAt: new Date("2026-03-22T15:00:00.000Z"),
        auctionEndsAt: new Date("2026-03-22T15:20:00.000Z"),
        vehicleId: "vehicle-1",
      },
    });

    const tx = {
      auction: {
        update: vi.fn().mockResolvedValue({}),
      },
      auctionStateTransition: {
        create: vi.fn().mockResolvedValue({}),
      },
      auctionEventLot: {
        delete: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          { id: "event-lot-2", position: 2 },
          { id: "event-lot-3", position: 3 },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await request
      .delete(`/api/admin/events/${eventId}/lots/event-lot-1`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
    expect(tx.auction.update).toHaveBeenCalledWith({
      where: {
        id: auctionId,
      },
      data: {
        state: "DRAFT",
        startsAt: expect.any(Date),
        endsAt: expect.any(Date),
        auctionStartsAt: null,
        auctionEndsAt: null,
      },
    });
    expect(tx.auctionStateTransition.create).toHaveBeenCalledWith({
      data: {
        auctionId,
        fromState: "SCHEDULED",
        toState: "DRAFT",
        trigger: "EVENT_REMOVED",
        actorId: adminUserId,
        reason: JSON.stringify({
          eventId,
        }),
      },
    });
    expect(tx.auctionEventLot.update).not.toHaveBeenCalled();
  });

  it("POST /api/admin/events/:id/start calls orchestrator startEvent", async () => {
    const response = await request
      .post(`/api/admin/events/${eventId}/start`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockStartEvent).toHaveBeenCalledWith(eventId);
  });

  it("notifyEventRuntime resets callRound and updates callEndsAt", async () => {
    mockPrisma.auctionEventLot.findFirst.mockResolvedValue({
      id: "event-lot-1",
      eventId,
    });

    const tx = {
      auctionEventLot: {
        update: vi.fn().mockResolvedValue({
          id: "event-lot-1",
        }),
      },
      auctionEventRuntime: {
        update: vi.fn().mockResolvedValue({
          eventId,
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await notifyEventRuntime(auctionId);

    expect(result).toBe(true);
    expect(tx.auctionEventLot.update).toHaveBeenCalledWith({
      where: {
        id: "event-lot-1",
      },
      data: {
        state: "ON_BLOCK",
        callRound: 0,
      },
    });
    expect(tx.auctionEventRuntime.update).toHaveBeenCalledWith({
      where: {
        eventId,
      },
      data: {
        callEndsAt: expect.any(Date),
      },
    });
    expect(MockRedis.published).toHaveLength(1);
    expect(MockRedis.published[0]?.channel).toBe(`event:live:${eventId}`);
    expect(JSON.parse(MockRedis.published[0]?.payload ?? "{}")).toEqual({
      type: "bid.received",
      auctionId,
      callRound: 0,
      callEndsAt: expect.any(String),
    });
  });

  it("GET /api/events/:id/ws sends event.runtime snapshot for authenticated client", async () => {
    mockPrisma.auctionEvent.findUnique.mockResolvedValue({
      id: eventId,
      state: "LIVE",
      runtime: {
        currentLotId: "event-lot-1",
        currentPosition: 0,
        callEndsAt: new Date("2026-03-20T09:05:00.000Z"),
      },
      lots: [
        {
          id: "event-lot-1",
          auctionId,
          position: 0,
          state: "ON_BLOCK",
          callRound: 0,
          onBlockAt: new Date("2026-03-20T09:04:40.000Z"),
          auction: {
            startingPrice: 50_000,
            vehicle: {
              brand: "BMW",
              model: "M4",
              year: 2024,
            },
          },
        },
      ],
    });

    const { socket, nextMessage } = await connectEventSocket(
      `/api/events/${eventId}/ws?token=${buyerToken}`,
    );

    const message = await nextMessage();

    expect(message.type).toBe("event.runtime");
    expect((message.data as { eventId: string }).eventId).toBe(eventId);

    socket.close();
    await once(socket, "close");
  });
});
