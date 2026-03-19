import { once } from "node:events";
import type { AddressInfo } from "node:net";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const { mockPrisma, MockRedis, resetMockRedis } = vi.hoisted(() => {
  const redisClients = new Set<{
    subscribedChannels: Set<string>;
    emit: (event: string, ...args: unknown[]) => number;
    disconnect: () => void;
  }>();

  class MockRedis {
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
      auction: {
        findUnique: vi.fn(),
      },
      $disconnect: vi.fn(),
    },
    MockRedis,
    resetMockRedis: (): void => {
      for (const client of [...redisClients]) {
        client.disconnect();
      }
    },
  };
});

vi.mock("../../db", () => ({
  prisma: mockPrisma,
}));

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

import { buildServer } from "../../server";
import { closeAuctionRealtime, publishAuctionRealtimeSnapshot } from "../auction-ws";

const auctionId = "auction-live-1";
const jwtSecret = "test-secret-32-chars-long-enough!!";

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

function makeAuctionRealtimeRecord(
  overrides: Partial<{
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
    id: auctionId,
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

async function connectAuctionSocket(path: string): Promise<{
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
let baseWsUrl: string;
let buyerToken: string;

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
    throw new Error("Websocket test server did not expose a listening address.");
  }

  baseWsUrl = `ws://127.0.0.1:${address.port}`;
  buyerToken = await makeToken({
    userId: "buyer-user-1",
    role: "BUYER",
    companyId: "buyer-company-1",
  });
});

afterAll(async () => {
  await server.close();
  await closeAuctionRealtime();
  delete process.env.REDIS_URL;
  delete process.env.JWT_SECRET;
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetMockRedis();
  await closeAuctionRealtime();
  mockPrisma.auction.findUnique.mockResolvedValue(makeAuctionRealtimeRecord());
});

describe("auction websocket route", () => {
  it("sends an initial auction snapshot on connect", async () => {
    const { socket, nextMessage } = await connectAuctionSocket(
      `/api/auctions/${auctionId}/ws?token=${buyerToken}`,
    );
    const message = await nextMessage();

    expect(message.type).toBe("auction.snapshot");
    expect(message.data).toEqual(
      expect.objectContaining({
        auctionId,
        state: "LIVE",
        currentPrice: 51_000,
        totalBids: 5,
      }),
    );

    socket.close();
    await once(socket, "close");
  });

  it("broadcasts published auction updates to connected clients", async () => {
    mockPrisma.auction.findUnique
      .mockResolvedValueOnce(makeAuctionRealtimeRecord())
      .mockResolvedValueOnce(
        makeAuctionRealtimeRecord({
          currentPrice: 52_000,
          totalBids: 6,
          extensionCount: 1,
          lastBidId: "bid-live-2",
          lastBidAmount: 52_000,
          lastBidSequenceNo: 6,
        }),
      );

    const { socket, nextMessage } = await connectAuctionSocket(
      `/api/auctions/${auctionId}/ws?token=${buyerToken}`,
    );
    const snapshot = await nextMessage();

    expect(snapshot.type).toBe("auction.snapshot");

    await publishAuctionRealtimeSnapshot(auctionId);

    const update = await nextMessage();

    expect(update.type).toBe("auction.updated");
    expect(update.data).toEqual(
      expect.objectContaining({
        auctionId,
        currentPrice: 52_000,
        totalBids: 6,
        extensionCount: 1,
      }),
    );

    socket.close();
    await once(socket, "close");
  });

  it("returns an error frame and closes when the auction does not exist", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(null);

    const { socket, nextMessage } = await connectAuctionSocket(
      `/api/auctions/${auctionId}/ws?token=${buyerToken}`,
    );
    const message = await nextMessage();

    expect(message.type).toBe("error");
    expect(message.code).toBe("AUCTION_NOT_FOUND");

    await once(socket, "close");
  });

  it("rejects connection with no token — socket closes with code 4401", async () => {
    const socket = new WebSocket(`${baseWsUrl}/api/auctions/${auctionId}/ws`);

    await once(socket, "open");

    const closeEvent = await once(socket, "close");
    const [code, reason] = closeEvent as [number, Buffer];

    expect(code).toBe(4401);
    expect(reason.toString("utf8")).toBe("Unauthorized");
  });
});

describe("GET /api/auctions/:auctionId/live-snapshot", () => {
  it("returns snapshot for existing auction", async () => {
    const response = await server.inject({
      method: "GET",
      url: `/api/auctions/${auctionId}/live-snapshot`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        auctionId,
        state: "LIVE",
        currentPrice: 51_000,
        totalBids: 5,
      }),
    );
  });

  it("returns 404 for unknown auction", async () => {
    mockPrisma.auction.findUnique.mockResolvedValue(null);

    const response = await server.inject({
      method: "GET",
      url: `/api/auctions/${auctionId}/live-snapshot`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Auction not found",
    });
  });
});
