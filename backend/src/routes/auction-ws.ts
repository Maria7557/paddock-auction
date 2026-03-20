import "@fastify/websocket";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import Redis from "ioredis";

import { prisma } from "../db";
import {
  hydrateAuthIfPresent,
  type AuthTokenPayload,
  verifyToken,
} from "../lib/auth";
import {
  evaluateVipAccess,
  loadVipRequestActorBase,
  readTrustedCurrentTime,
} from "../lib/vip-early-access";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthTokenPayload;
  }
}

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

type AuctionRealtimeSnapshot = {
  auctionId: string;
  state: string;
  currentPrice: number;
  minIncrement: number;
  startingPrice: number;
  buyNowPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  extensionCount: number;
  totalBids: number;
  highestBidId: string | null;
  lastBid:
    | {
        id: string;
        amount: number;
        sequenceNo: number;
        createdAt: string;
      }
    | null;
};

type AuctionRealtimeSnapshotRecord = {
  snapshot: AuctionRealtimeSnapshot;
  accessSnapshot: {
    approvedAt: Date | null;
    vipAccessPolicy: string | null;
    vipReleaseAt: Date | null;
    sellerCompanyId: string;
  };
};

type AuctionRealtimeEnvelope =
  | {
      type: "auction.snapshot" | "auction.updated";
      emittedAt: string;
      data: AuctionRealtimeSnapshot;
    }
  | {
      type: "error";
      emittedAt: string;
      code: string;
      message: string;
    }
  | {
      type: "system.pong";
      emittedAt: string;
    }
  | {
      type: "realtime.status";
      emittedAt: string;
      data: {
        available: boolean;
        reason: string;
      };
    };

type LoggerLike = {
  warn?: (object: Record<string, unknown>, message?: string) => void;
  error?: (object: Record<string, unknown>, message?: string) => void;
};

type AuctionWsRequest = FastifyRequest<{
  Params: {
    auctionId: string;
  };
  Querystring: {
    token?: string;
  };
}>;

const SOCKET_OPEN_STATE = 1;
const AUCTION_WS_CHANNEL_PREFIX = "auction:live:";
const socketRegistry = new Map<string, Set<WebSocket>>();
const subscribedChannels = new Set<string>();

let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;
let redisPublisherPromise: Promise<Redis | null> | null = null;
let redisSubscriberPromise: Promise<Redis | null> | null = null;
let subscriberListenersBound = false;

function getRedisUrl(): string | null {
  const value = process.env.REDIS_URL?.trim();

  return value ? value : null;
}

function buildAuctionChannel(auctionId: string): string {
  return `${AUCTION_WS_CHANNEL_PREFIX}${auctionId}`;
}

function parseAuctionIdFromChannel(channel: string): string | null {
  if (!channel.startsWith(AUCTION_WS_CHANNEL_PREFIX)) {
    return null;
  }

  const auctionId = channel.slice(AUCTION_WS_CHANNEL_PREFIX.length).trim();

  return auctionId.length > 0 ? auctionId : null;
}

function createEnvelope(message: AuctionRealtimeEnvelope): string {
  return JSON.stringify(message);
}

function sendMessage(socket: WebSocket, message: AuctionRealtimeEnvelope): void {
  if (socket.readyState !== SOCKET_OPEN_STATE) {
    return;
  }

  socket.send(createEnvelope(message));
}

function addSocket(auctionId: string, socket: WebSocket): void {
  const sockets = socketRegistry.get(auctionId) ?? new Set<WebSocket>();

  sockets.add(socket);
  socketRegistry.set(auctionId, sockets);
}

async function removeSocket(auctionId: string, socket: WebSocket): Promise<void> {
  const sockets = socketRegistry.get(auctionId);

  if (!sockets) {
    return;
  }

  sockets.delete(socket);

  if (sockets.size > 0) {
    return;
  }

  socketRegistry.delete(auctionId);
  await unsubscribeAuctionChannel(auctionId);
}

function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: null,
  });

  client.on("error", () => {
    // Realtime is best-effort and must not crash the process.
  });

  return client;
}

async function safeCloseRedisClient(client: Redis | null): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.quit();
  } catch {
    client.disconnect(false);
  }
}

async function ensureConnectedPublisher(): Promise<Redis | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (redisPublisher) {
    return redisPublisher;
  }

  if (redisPublisherPromise) {
    return redisPublisherPromise;
  }

  redisPublisherPromise = (async () => {
    const client = createRedisClient(redisUrl);

    try {
      await client.connect();
      redisPublisher = client;
      return client;
    } catch {
      await safeCloseRedisClient(client);
      return null;
    } finally {
      redisPublisherPromise = null;
    }
  })();

  return redisPublisherPromise;
}

function bindSubscriberListeners(client: Redis): void {
  if (subscriberListenersBound) {
    return;
  }

  client.on("message", (channel, payload) => {
    const auctionId = parseAuctionIdFromChannel(channel);

    if (!auctionId) {
      return;
    }

    const sockets = socketRegistry.get(auctionId);

    if (!sockets || sockets.size === 0) {
      return;
    }

    for (const socket of sockets) {
      if (socket.readyState !== SOCKET_OPEN_STATE) {
        sockets.delete(socket);
        continue;
      }

      socket.send(payload);
    }

    if (sockets.size === 0) {
      socketRegistry.delete(auctionId);
    }
  });

  subscriberListenersBound = true;
}

async function ensureConnectedSubscriber(): Promise<Redis | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (redisSubscriber) {
    return redisSubscriber;
  }

  if (redisSubscriberPromise) {
    return redisSubscriberPromise;
  }

  redisSubscriberPromise = (async () => {
    const client = createRedisClient(redisUrl);

    try {
      await client.connect();
      bindSubscriberListeners(client);
      redisSubscriber = client;
      return client;
    } catch {
      await safeCloseRedisClient(client);
      return null;
    } finally {
      redisSubscriberPromise = null;
    }
  })();

  return redisSubscriberPromise;
}

async function subscribeAuctionChannel(auctionId: string): Promise<boolean> {
  const subscriber = await ensureConnectedSubscriber();

  if (!subscriber) {
    return false;
  }

  const channel = buildAuctionChannel(auctionId);

  if (subscribedChannels.has(channel)) {
    return true;
  }

  try {
    await subscriber.subscribe(channel);
    subscribedChannels.add(channel);
    return true;
  } catch {
    return false;
  }
}

async function unsubscribeAuctionChannel(auctionId: string): Promise<void> {
  if (!redisSubscriber) {
    return;
  }

  const channel = buildAuctionChannel(auctionId);

  if (!subscribedChannels.has(channel)) {
    return;
  }

  try {
    await redisSubscriber.unsubscribe(channel);
  } catch {
    return;
  } finally {
    subscribedChannels.delete(channel);
  }
}

async function toNumberValue(value: DecimalLike): Promise<number> {
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
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

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

async function toIsoString(value: Date | string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to date");
  }

  return parsed.toISOString();
}

function getTokenFromAuthorizationHeader(
  authorizationHeader: string | undefined,
): string | null {
  const authorization = authorizationHeader?.trim() ?? "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  return token.length > 0 ? token : null;
}

function getTokenFromQueryString(request: AuctionWsRequest): string | null {
  const queryToken = request.query?.token?.trim();

  if (queryToken && queryToken.length > 0) {
    return queryToken;
  }

  const requestUrl = request.raw.url;

  if (!requestUrl) {
    return null;
  }

  const parsedUrl = new URL(requestUrl, "http://localhost");
  const token = parsedUrl.searchParams.get("token")?.trim();

  return token && token.length > 0 ? token : null;
}

async function getWebSocketToken(request: AuctionWsRequest): Promise<string | null> {
  const headerToken = getTokenFromAuthorizationHeader(request.headers.authorization);

  if (headerToken) {
    return headerToken;
  }

  return getTokenFromQueryString(request);
}

async function authenticateWebSocketRequest(
  request: AuctionWsRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const token = await getWebSocketToken(request);

    if (!token) {
      return;
    }

    const payload = await verifyToken(token);

    request.user = payload;
    request.auth = payload;
  } catch {
    request.user = undefined;
    request.auth = undefined;
  }
}

async function getAuctionSnapshot(
  auctionId: string,
  db: typeof prisma,
): Promise<AuctionRealtimeSnapshotRecord | null> {
  const auction = await db.auction.findUnique({
    where: {
      id: auctionId,
    },
    select: {
      id: true,
      state: true,
      currentPrice: true,
      minIncrement: true,
      startingPrice: true,
      buyNowPrice: true,
      startsAt: true,
      endsAt: true,
      extensionCount: true,
      highestBidId: true,
      approvedAt: true,
      vipAccessPolicy: true,
      vipReleaseAt: true,
      sellerCompanyId: true,
      _count: {
        select: {
          bids: true,
        },
      },
      bids: {
        take: 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          amount: true,
          sequenceNo: true,
          createdAt: true,
        },
      },
    },
  });

  if (!auction) {
    return null;
  }

  const latestBid = auction.bids[0] ?? null;

  return {
    snapshot: {
      auctionId: auction.id,
      state: auction.state,
      currentPrice: await toNumberValue(auction.currentPrice),
      minIncrement: await toNumberValue(auction.minIncrement),
      startingPrice: await toNumberValue(auction.startingPrice),
      buyNowPrice: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
      startsAt: await toIsoString(auction.startsAt),
      endsAt: await toIsoString(auction.endsAt),
      extensionCount: auction.extensionCount,
      totalBids: auction._count.bids,
      highestBidId: auction.highestBidId,
      lastBid:
        latestBid === null
          ? null
          : {
              id: latestBid.id,
              amount: await toNumberValue(latestBid.amount),
              sequenceNo: latestBid.sequenceNo,
              createdAt: latestBid.createdAt.toISOString(),
            },
    },
    accessSnapshot: {
      approvedAt: auction.approvedAt,
      vipAccessPolicy: auction.vipAccessPolicy,
      vipReleaseAt: auction.vipReleaseAt,
      sellerCompanyId: auction.sellerCompanyId,
    },
  };
}

function normalizeClientMessage(message: Buffer | ArrayBuffer | Buffer[] | string): string {
  if (typeof message === "string") {
    return message;
  }

  if (Buffer.isBuffer(message)) {
    return message.toString("utf8");
  }

  if (Array.isArray(message)) {
    return Buffer.concat(message).toString("utf8");
  }

  return Buffer.from(message).toString("utf8");
}

function handleClientMessage(socket: WebSocket, message: Buffer | ArrayBuffer | Buffer[] | string): void {
  const text = normalizeClientMessage(message).trim();

  if (text === "ping") {
    sendMessage(socket, {
      type: "system.pong",
      emittedAt: new Date().toISOString(),
    });
    return;
  }

  if (!text) {
    return;
  }

  try {
    const payload = JSON.parse(text) as { type?: unknown };

    if (payload.type === "ping") {
      sendMessage(socket, {
        type: "system.pong",
        emittedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Ignore malformed client messages to keep the channel read-only.
  }
}

export async function publishAuctionRealtimeSnapshot(
  auctionId: string,
  logger?: LoggerLike,
): Promise<boolean> {
  try {
    const snapshotRecord = await getAuctionSnapshot(auctionId, prisma);

    if (!snapshotRecord) {
      return false;
    }

    const publisher = await ensureConnectedPublisher();

    if (!publisher) {
      logger?.warn?.(
        {
          auctionId,
        },
        "Auction realtime publish skipped because Redis is unavailable",
      );
      return false;
    }

    await publisher.publish(
      buildAuctionChannel(auctionId),
      createEnvelope({
        type: "auction.updated",
        emittedAt: new Date().toISOString(),
        data: snapshotRecord.snapshot,
      }),
    );

    return true;
  } catch (error) {
    logger?.warn?.(
      {
        err: error,
        auctionId,
      },
      "Auction realtime publish failed",
    );
    return false;
  }
}

export async function closeAuctionRealtime(): Promise<void> {
  subscribedChannels.clear();
  socketRegistry.clear();

  await Promise.all([
    safeCloseRedisClient(redisPublisher),
    safeCloseRedisClient(redisSubscriber),
  ]);

  redisPublisher = null;
  redisSubscriber = null;
  redisPublisherPromise = null;
  redisSubscriberPromise = null;
  subscriberListenersBound = false;
}

export async function auctionWsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onClose", async () => {
    await closeAuctionRealtime();
  });

  fastify.get<{ Params: { auctionId: string } }>(
    "/auctions/:auctionId/live-snapshot",
    async function auctionLiveSnapshotHandler(
      request: FastifyRequest<{ Params: { auctionId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const auctionId = request.params.auctionId.trim();
      await hydrateAuthIfPresent(request);

      const [actorBase, now, snapshotRecord] = await Promise.all([
        loadVipRequestActorBase(request),
        readTrustedCurrentTime(prisma),
        getAuctionSnapshot(auctionId, prisma),
      ]);

      if (!snapshotRecord) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      const accessDecision = evaluateVipAccess({
        actorBase,
        snapshot: snapshotRecord.accessSnapshot,
        now,
      });

      if (!accessDecision.canViewRealtime) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      await reply.code(200).send(snapshotRecord.snapshot);
    },
  );

  // The websocket plugin augments Fastify at runtime, but the overload does
  // not resolve correctly in this workspace's backend tsconfig.
  (fastify.get as any)(
    "/auctions/:auctionId/ws",
    {
      websocket: true,
      preHandler: authenticateWebSocketRequest,
    },
    function auctionWsHandler(socket: WebSocket, request: AuctionWsRequest): void {
      const auctionId = request.params.auctionId.trim();

      socket.on("message", (message: RawData) => {
        handleClientMessage(socket, message);
      });

      socket.on("error", () => {
        void removeSocket(auctionId, socket);
      });

      socket.on("close", () => {
        void removeSocket(auctionId, socket);
      });

      if (!auctionId) {
        sendMessage(socket, {
          type: "error",
          emittedAt: new Date().toISOString(),
          code: "INVALID_AUCTION_ID",
          message: "Auction id is required.",
        });
        socket.close(1008, "Invalid auction id");
        return;
      }

      if (!request.user) {
        socket.close(4401, "Unauthorized");
        return;
      }

      void (async () => {
        const [actorBase, now, snapshotRecord] = await Promise.all([
          loadVipRequestActorBase(request),
          readTrustedCurrentTime(prisma),
          getAuctionSnapshot(auctionId, prisma),
        ]);

        if (!snapshotRecord) {
          sendMessage(socket, {
            type: "error",
            emittedAt: new Date().toISOString(),
            code: "AUCTION_NOT_FOUND",
            message: "Auction not found.",
          });
          socket.close(1008, "Auction not found");
          return;
        }

        const accessDecision = evaluateVipAccess({
          actorBase,
          snapshot: snapshotRecord.accessSnapshot,
          now,
        });

        if (!accessDecision.canViewRealtime) {
          sendMessage(socket, {
            type: "error",
            emittedAt: new Date().toISOString(),
            code: "AUCTION_UNAVAILABLE",
            message: "Auction unavailable.",
          });
          socket.close(1008, "Auction unavailable");
          return;
        }

        if (socket.readyState !== SOCKET_OPEN_STATE) {
          return;
        }

        addSocket(auctionId, socket);
        sendMessage(socket, {
          type: "auction.snapshot",
          emittedAt: new Date().toISOString(),
          data: snapshotRecord.snapshot,
        });

        const subscribed = await subscribeAuctionChannel(auctionId);

        if (!subscribed) {
          sendMessage(socket, {
            type: "realtime.status",
            emittedAt: new Date().toISOString(),
            data: {
              available: false,
              reason: "Redis pub/sub is unavailable.",
            },
          });
        }
      })().catch((error) => {
        fastify.log.error(
          {
            err: error,
            auctionId,
          },
          "Auction websocket initialization failed",
        );

        sendMessage(socket, {
          type: "error",
          emittedAt: new Date().toISOString(),
          code: "WS_INIT_FAILED",
          message: "Unable to initialize realtime connection.",
        });
        socket.close(1011, "Realtime init failed");
      });
    },
  );
}
