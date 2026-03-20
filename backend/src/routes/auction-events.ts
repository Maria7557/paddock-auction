import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import Redis from "ioredis";
import { z } from "zod";

import { prisma } from "../db";
import { startEvent } from "../lib/event-orchestrator";
import { type AuthTokenPayload, requireAdminAuth, verifyToken } from "../lib/auth";
import { type AuctionRealtimeSnapshot, getAuctionSnapshot } from "./auction-ws";

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

type LoggerLike = {
  warn?: (object: Record<string, unknown>, message?: string) => void;
};

type EventRuntimeSnapshot = {
  eventId: string;
  scheduledAt: string;
  state: "SCHEDULED" | "LIVE" | "CLOSED";
  currentLot:
    | {
        lotId: string;
        auctionId: string;
        position: number;
        callRound: number;
        callEndsAt: string;
        onBlockAt: string;
        snapshot: AuctionRealtimeSnapshot;
      }
    | null;
  totalLots: number;
  completedLots: number;
  upcomingLots: Array<{
    position: number;
    auctionId: string;
    title: string;
    startingPrice: number;
  }>;
};

type EventRuntimeEnvelope =
  | {
      type: "event.runtime";
      emittedAt: string;
      data: EventRuntimeSnapshot;
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
    };

type AuctionEventWsRequest = FastifyRequest<{
  Params: {
    eventId: string;
  };
  Querystring: {
    token?: string;
  };
}>;

type CreateAuctionEventInput = {
  id: string;
  title: string;
  scheduledAt: Date;
};

type AuctionEventCreateTx = Prisma.TransactionClient;

const SOCKET_OPEN_STATE = 1;
const NORMAL_CALL_DURATION_MS = 20_000;
const EVENT_CHANNEL_PREFIX = "event:live:";
const runtimeSocketRegistry = new Map<string, Set<WebSocket>>();
const subscribedEventChannels = new Set<string>();

let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;
let redisPublisherPromise: Promise<Redis | null> | null = null;
let redisSubscriberPromise: Promise<Redis | null> | null = null;
let subscriberListenersBound = false;

const eventIdParamsSchema = z.object({
  eventId: z.string().trim().min(1),
});

const eventLotParamsSchema = z.object({
  eventId: z.string().trim().min(1),
  lotId: z.string().trim().min(1),
});

const addEventLotSchema = z.object({
  auctionId: z.string().trim().min(1),
  position: z.coerce.number().int().nonnegative(),
});

function buildEventChannel(eventId: string): string {
  return `${EVENT_CHANNEL_PREFIX}${eventId}`;
}

function parseEventIdFromChannel(channel: string): string | null {
  if (!channel.startsWith(EVENT_CHANNEL_PREFIX)) {
    return null;
  }

  const eventId = channel.slice(EVENT_CHANNEL_PREFIX.length).trim();

  return eventId.length > 0 ? eventId : null;
}

function getRedisUrl(): string | null {
  const value = process.env.REDIS_URL?.trim();

  return value ? value : null;
}

function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: null,
  });

  client.on("error", () => {
    // Realtime publish/subscribe is best effort and must not crash the process.
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
    const eventId = parseEventIdFromChannel(channel);

    if (!eventId) {
      return;
    }

    const sockets = runtimeSocketRegistry.get(eventId);

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
      runtimeSocketRegistry.delete(eventId);
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

async function subscribeEventChannel(eventId: string): Promise<boolean> {
  const subscriber = await ensureConnectedSubscriber();

  if (!subscriber) {
    return false;
  }

  const channel = buildEventChannel(eventId);

  if (subscribedEventChannels.has(channel)) {
    return true;
  }

  try {
    await subscriber.subscribe(channel);
    subscribedEventChannels.add(channel);
    return true;
  } catch {
    return false;
  }
}

async function unsubscribeEventChannel(eventId: string): Promise<void> {
  if (!redisSubscriber) {
    return;
  }

  const channel = buildEventChannel(eventId);

  if (!subscribedEventChannels.has(channel)) {
    return;
  }

  try {
    await redisSubscriber.unsubscribe(channel);
  } finally {
    subscribedEventChannels.delete(channel);
  }
}

function addSocket(eventId: string, socket: WebSocket): void {
  const sockets = runtimeSocketRegistry.get(eventId) ?? new Set<WebSocket>();

  sockets.add(socket);
  runtimeSocketRegistry.set(eventId, sockets);
}

async function removeSocket(eventId: string, socket: WebSocket): Promise<void> {
  const sockets = runtimeSocketRegistry.get(eventId);

  if (!sockets) {
    return;
  }

  sockets.delete(socket);

  if (sockets.size > 0) {
    return;
  }

  runtimeSocketRegistry.delete(eventId);
  await unsubscribeEventChannel(eventId);
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

function createEnvelope(message: EventRuntimeEnvelope): string {
  return JSON.stringify(message);
}

function sendMessage(socket: WebSocket, message: EventRuntimeEnvelope): void {
  if (socket.readyState !== SOCKET_OPEN_STATE) {
    return;
  }

  socket.send(createEnvelope(message));
}

function getTokenFromAuthorizationHeader(authorizationHeader: string | undefined): string | null {
  const authorization = authorizationHeader?.trim() ?? "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  return token.length > 0 ? token : null;
}

function getTokenFromQueryString(request: AuctionEventWsRequest): string | null {
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

async function getWebSocketToken(request: AuctionEventWsRequest): Promise<string | null> {
  const headerToken = getTokenFromAuthorizationHeader(request.headers.authorization);

  if (headerToken) {
    return headerToken;
  }

  return getTokenFromQueryString(request);
}

async function authenticateWebSocketRequest(
  request: AuctionEventWsRequest,
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
    // Ignore malformed client messages.
  }
}

function buildUpcomingLotTitle(input: {
  year: number;
  brand: string;
  model: string;
}): string {
  return `${input.year} ${input.brand} ${input.model}`;
}

function normalizePaymentLabel(state: string): string | null {
  if (state === "PAYMENT_PENDING") {
    return "Awaiting payment";
  }

  if (state === "PAID") {
    return "Paid";
  }

  if (state === "DEFAULTED") {
    return "Defaulted";
  }

  return null;
}

function normalizeResultStatus(
  lotState: string,
  auctionState: string,
): "QUEUED" | "ON_BLOCK" | "SOLD" | "UNSOLD" | "SOLD_DEFAULTED" {
  if (lotState === "QUEUED" || lotState === "ON_BLOCK" || lotState === "LAST_CHANCE_1" || lotState === "LAST_CHANCE_2") {
    return lotState === "QUEUED" ? "QUEUED" : "ON_BLOCK";
  }

  if (lotState === "UNSOLD" || lotState === "CLOSED") {
    return "UNSOLD";
  }

  if (auctionState === "DEFAULTED") {
    return "SOLD_DEFAULTED";
  }

  return "SOLD";
}

export async function createAuctionEventRecord(
  tx: AuctionEventCreateTx,
  input: CreateAuctionEventInput,
): Promise<void> {
  await tx.auctionEvent.create({
    data: {
      id: input.id,
      title: input.title,
      scheduledAt: input.scheduledAt,
      state: "SCHEDULED",
    },
  });
}

export async function getEventRuntimeSnapshot(
  eventId: string,
  db: typeof prisma = prisma,
): Promise<EventRuntimeSnapshot | null> {
  const event = await db.auctionEvent.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      scheduledAt: true,
      state: true,
      runtime: {
        select: {
          currentLotId: true,
          currentPosition: true,
          callEndsAt: true,
        },
      },
      lots: {
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
          auctionId: true,
          position: true,
          state: true,
          callRound: true,
          onBlockAt: true,
          auction: {
            select: {
              startingPrice: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                  year: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  const activeLot =
    event.lots.find((lot) => lot.id === event.runtime?.currentLotId) ??
    event.lots.find((lot) => ["ON_BLOCK", "LAST_CHANCE_1", "LAST_CHANCE_2"].includes(lot.state));

  const currentLotSnapshot = activeLot
    ? await getAuctionSnapshot(activeLot.auctionId, db)
    : null;
  const completedLots = event.lots.filter((lot) => ["SOLD", "UNSOLD", "CLOSED"].includes(lot.state)).length;
  const currentPosition = activeLot?.position ?? event.runtime?.currentPosition ?? -1;
  const upcomingLots = await Promise.all(
    event.lots
      .filter((lot) => lot.position > currentPosition && lot.state === "QUEUED")
      .map(async (lot) => ({
        position: lot.position,
        auctionId: lot.auctionId,
        title: buildUpcomingLotTitle({
          year: lot.auction.vehicle.year,
          brand: lot.auction.vehicle.brand,
          model: lot.auction.vehicle.model,
        }),
        startingPrice: await toNumberValue(lot.auction.startingPrice),
      })),
  );

  return {
    eventId: event.id,
    scheduledAt: (event.scheduledAt instanceof Date ? event.scheduledAt : new Date()).toISOString(),
    state: event.state,
    currentLot:
      activeLot && currentLotSnapshot
        ? {
            lotId: activeLot.id,
            auctionId: activeLot.auctionId,
            position: activeLot.position,
            callRound: activeLot.callRound,
            callEndsAt:
              (await toIsoString(event.runtime?.callEndsAt)) ?? new Date().toISOString(),
            onBlockAt: (await toIsoString(activeLot.onBlockAt)) ?? new Date().toISOString(),
            snapshot: currentLotSnapshot,
          }
        : null,
    totalLots: event.lots.length,
    completedLots,
    upcomingLots,
  };
}

export async function notifyEventRuntime(
  auctionId: string,
  logger?: LoggerLike,
): Promise<boolean> {
  try {
    const currentLot = await prisma.auctionEventLot.findFirst({
      where: {
        auctionId,
        state: {
          in: ["ON_BLOCK", "LAST_CHANCE_1", "LAST_CHANCE_2"],
        },
        event: {
          is: {
            state: "LIVE",
          },
        },
      },
      select: {
        id: true,
        eventId: true,
      },
    });

    if (!currentLot) {
      return false;
    }

    const callEndsAt = new Date(Date.now() + NORMAL_CALL_DURATION_MS);

    await prisma.$transaction(async (tx) => {
      await tx.auctionEventLot.update({
        where: {
          id: currentLot.id,
        },
        data: {
          state: "ON_BLOCK",
          callRound: 0,
        },
      });

      await tx.auctionEventRuntime.update({
        where: {
          eventId: currentLot.eventId,
        },
        data: {
          callEndsAt,
        },
      });
    });

    const publisher = await ensureConnectedPublisher();

    if (!publisher) {
      return false;
    }

    void publisher
      .publish(
        buildEventChannel(currentLot.eventId),
        JSON.stringify({
          type: "bid.received",
          auctionId,
          callRound: 0,
          callEndsAt: callEndsAt.toISOString(),
        }),
      )
      .catch(() => {
        // Fire-and-forget best effort publish.
      });

    return true;
  } catch (error) {
    logger?.warn?.(
      {
        err: error,
        auctionId,
      },
      "Event runtime update after bid failed",
    );

    return false;
  }
}

export async function closeEventRuntimeRealtime(): Promise<void> {
  subscribedEventChannels.clear();
  runtimeSocketRegistry.clear();

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

export async function auctionEventsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: {
      auctionId: string;
    };
  }>(
    "/events/by-auction/:auctionId",
    async function getEventByAuctionHandler(
      request: FastifyRequest<{
        Params: {
          auctionId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const auctionId = request.params?.auctionId?.trim();

      if (!auctionId) {
        await reply.code(400).send({
          error: "INVALID_AUCTION_ID",
        });
        return;
      }

      const eventLots = await prisma.auctionEventLot.findMany({
        where: {
          auctionId,
          event: {
            is: {
              state: {
                in: ["LIVE", "SCHEDULED"],
              },
            },
          },
        },
        select: {
          eventId: true,
          event: {
            select: {
              state: true,
              scheduledAt: true,
            },
          },
        },
      });

      if (eventLots.length === 0) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const selectedEvent = eventLots
        .slice()
        .sort((left, right) => {
          if (left.event.state === right.event.state) {
            return left.event.scheduledAt.getTime() - right.event.scheduledAt.getTime();
          }

          return left.event.state === "LIVE" ? -1 : 1;
        })[0];

      await reply.code(200).send({
        eventId: selectedEvent.eventId,
      });
    },
  );

  fastify.get<{
    Params: {
      eventId: string;
    };
  }>(
    "/events/:eventId/runtime",
    async function getEventRuntimeHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await reply.code(400).send({
          error: "INVALID_EVENT_ID",
        });
        return;
      }

      const snapshot = await getEventRuntimeSnapshot(parsedParams.data.eventId);

      if (!snapshot) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      await reply.code(200).send(snapshot);
    },
  );

  fastify.get<{
    Params: {
      eventId: string;
    };
    Querystring: {
      token?: string;
    };
  }>(
    "/events/:eventId/ws",
    {
      websocket: true,
      preHandler: authenticateWebSocketRequest,
    },
    function eventRuntimeWsHandler(socket, request: AuctionEventWsRequest): void {
      const eventId = request.params.eventId.trim();

      socket.on("message", (message) => {
        handleClientMessage(socket, message);
      });

      socket.on("error", () => {
        void removeSocket(eventId, socket);
      });

      socket.on("close", () => {
        void removeSocket(eventId, socket);
      });

      if (!eventId) {
        sendMessage(socket, {
          type: "error",
          emittedAt: new Date().toISOString(),
          code: "INVALID_EVENT_ID",
          message: "Event id is required.",
        });
        socket.close(1008, "Invalid event id");
        return;
      }

      if (!request.user) {
        socket.close(4401, "Unauthorized");
        return;
      }

      void (async () => {
        const snapshot = await getEventRuntimeSnapshot(eventId);

        if (!snapshot) {
          sendMessage(socket, {
            type: "error",
            emittedAt: new Date().toISOString(),
            code: "EVENT_NOT_FOUND",
            message: "Event not found.",
          });
          socket.close(1008, "Event not found");
          return;
        }

        if (socket.readyState !== SOCKET_OPEN_STATE) {
          return;
        }

        addSocket(eventId, socket);
        sendMessage(socket, {
          type: "event.runtime",
          emittedAt: new Date().toISOString(),
          data: snapshot,
        });

        await subscribeEventChannel(eventId);
      })().catch(() => {
        socket.close(1011, "Internal error");
      });
    },
  );

  fastify.get<{
    Params: {
      eventId: string;
    };
  }>(
    "/admin/events/:eventId/lots",
    {
      preHandler: requireAdminAuth,
    },
    async function getAdminEventLotsHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await reply.code(400).send({
          error: "INVALID_EVENT_ID",
        });
        return;
      }

      const event = await prisma.auctionEvent.findUnique({
        where: {
          id: parsedParams.data.eventId,
        },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          state: true,
          lots: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              auctionId: true,
              position: true,
              state: true,
              auction: {
                select: {
                  currentPrice: true,
                  startingPrice: true,
                  vehicle: {
                    select: {
                      brand: true,
                      model: true,
                      year: true,
                      images: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const queuedAuctionIds = event.lots.map((lot) => lot.auctionId);
      const availableAuctions = await prisma.auction.findMany({
        where: {
          state: "SCHEDULED",
          id: {
            notIn: queuedAuctionIds.length > 0 ? queuedAuctionIds : undefined,
          },
          eventLots: {
            none: {},
          },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          startingPrice: true,
          vehicle: {
            select: {
              brand: true,
              model: true,
              year: true,
            },
          },
        },
      });

      await reply.code(200).send({
        event: {
          id: event.id,
          title: event.title,
          scheduledAt: event.scheduledAt.toISOString(),
          state: event.state,
        },
        lots: await Promise.all(
          event.lots.map(async (lot) => ({
            id: lot.id,
            auctionId: lot.auctionId,
            position: lot.position,
            state: lot.state,
            title: buildUpcomingLotTitle({
              year: lot.auction.vehicle.year,
              brand: lot.auction.vehicle.brand,
              model: lot.auction.vehicle.model,
            }),
            startingPrice: await toNumberValue(lot.auction.startingPrice),
            currentPrice: await toNumberValue(lot.auction.currentPrice),
            imageUrl: lot.auction.vehicle.images[0] ?? null,
          })),
        ),
        availableAuctions: await Promise.all(
          availableAuctions.map(async (auction) => ({
            auctionId: auction.id,
            title: buildUpcomingLotTitle({
              year: auction.vehicle.year,
              brand: auction.vehicle.brand,
              model: auction.vehicle.model,
            }),
            startingPrice: await toNumberValue(auction.startingPrice),
          })),
        ),
      });
    },
  );

  fastify.get<{
    Params: {
      eventId: string;
    };
  }>(
    "/admin/events/:eventId/results",
    {
      preHandler: requireAdminAuth,
    },
    async function getAdminEventResultsHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await reply.code(400).send({
          error: "INVALID_EVENT_ID",
        });
        return;
      }

      const event = await prisma.auctionEvent.findUnique({
        where: {
          id: parsedParams.data.eventId,
        },
        select: {
          id: true,
          title: true,
          state: true,
          scheduledAt: true,
          lots: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              auctionId: true,
              position: true,
              state: true,
              auction: {
                select: {
                  id: true,
                  state: true,
                  currentPrice: true,
                  startingPrice: true,
                  winnerCompanyId: true,
                  vehicle: {
                    select: {
                      brand: true,
                      model: true,
                      year: true,
                    },
                  },
                  _count: {
                    select: {
                      bids: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const winnerCompanyIds = Array.from(
        new Set(
          event.lots
            .map((lot) => lot.auction.winnerCompanyId)
            .filter((companyId): companyId is string => typeof companyId === "string" && companyId.length > 0),
        ),
      );
      const companies = winnerCompanyIds.length
        ? await prisma.company.findMany({
            where: {
              id: {
                in: winnerCompanyIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];
      const companyNameById = new Map(companies.map((company) => [company.id, company.name]));

      await reply.code(200).send({
        event: {
          id: event.id,
          title: event.title,
          scheduledAt: event.scheduledAt.toISOString(),
          state: event.state,
        },
        results: await Promise.all(
          event.lots.map(async (lot) => ({
            lotId: lot.id,
            position: lot.position,
            auctionId: lot.auctionId,
            vehicle: buildUpcomingLotTitle({
              year: lot.auction.vehicle.year,
              brand: lot.auction.vehicle.brand,
              model: lot.auction.vehicle.model,
            }),
            status: normalizeResultStatus(lot.state, lot.auction.state),
            winningBid: await toNumberValue(lot.auction.currentPrice),
            bids: lot.auction._count.bids,
            buyerCompany: lot.auction.winnerCompanyId
              ? companyNameById.get(lot.auction.winnerCompanyId) ?? "Unknown buyer"
              : null,
            payment: normalizePaymentLabel(lot.auction.state),
          })),
        ),
      });
    },
  );

  fastify.post<{
    Params: {
      eventId: string;
    };
    Body: unknown;
  }>(
    "/admin/events/:eventId/lots",
    {
      preHandler: requireAdminAuth,
    },
    async function addEventLotHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
        };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventIdParamsSchema.safeParse(request.params);
      const parsedBody = addEventLotSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        await reply.code(400).send({
          error: "INVALID_REQUEST",
        });
        return;
      }

      const event = await prisma.auctionEvent.findUnique({
        where: {
          id: parsedParams.data.eventId,
        },
        select: {
          id: true,
        },
      });

      if (!event) {
        await reply.code(404).send({
          error: "EVENT_NOT_FOUND",
        });
        return;
      }

      const auction = await prisma.auction.findUnique({
        where: {
          id: parsedBody.data.auctionId,
        },
        select: {
          id: true,
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "AUCTION_NOT_FOUND",
        });
        return;
      }

      const [duplicateAuction, duplicatePosition] = await Promise.all([
        prisma.auctionEventLot.findFirst({
          where: {
            eventId: event.id,
            auctionId: parsedBody.data.auctionId,
          },
          select: {
            id: true,
          },
        }),
        prisma.auctionEventLot.findFirst({
          where: {
            eventId: event.id,
            position: parsedBody.data.position,
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (duplicateAuction) {
        await reply.code(409).send({
          error: "EVENT_LOT_DUPLICATE_AUCTION",
        });
        return;
      }

      if (duplicatePosition) {
        await reply.code(409).send({
          error: "EVENT_LOT_POSITION_TAKEN",
        });
        return;
      }

      const lot = await prisma.auctionEventLot.create({
        data: {
          eventId: event.id,
          auctionId: parsedBody.data.auctionId,
          position: parsedBody.data.position,
        },
      });

      await reply.code(201).send(lot);
    },
  );

  fastify.delete<{
    Params: {
      eventId: string;
      lotId: string;
    };
  }>(
    "/admin/events/:eventId/lots/:lotId",
    {
      preHandler: requireAdminAuth,
    },
    async function deleteEventLotHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
          lotId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventLotParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await reply.code(400).send({
          error: "INVALID_REQUEST",
        });
        return;
      }

      const lot = await prisma.auctionEventLot.findUnique({
        where: {
          id: parsedParams.data.lotId,
        },
        select: {
          id: true,
          eventId: true,
          state: true,
        },
      });

      if (!lot || lot.eventId !== parsedParams.data.eventId) {
        await reply.code(404).send({
          error: "EVENT_LOT_NOT_FOUND",
        });
        return;
      }

      if (lot.state !== "QUEUED") {
        await reply.code(409).send({
          error: "EVENT_LOT_NOT_REMOVABLE",
        });
        return;
      }

      await prisma.auctionEventLot.delete({
        where: {
          id: lot.id,
        },
      });

      await reply.code(204).send();
    },
  );

  fastify.post<{
    Params: {
      eventId: string;
    };
  }>(
    "/admin/events/:eventId/start",
    {
      preHandler: requireAdminAuth,
    },
    async function startAdminEventHandler(
      request: FastifyRequest<{
        Params: {
          eventId: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = eventIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await reply.code(400).send({
          error: "INVALID_EVENT_ID",
        });
        return;
      }

      try {
        await startEvent(parsedParams.data.eventId);
        await reply.code(200).send({
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start event";

        await reply.code(409).send({
          error: message,
        });
      }
    },
  );
}
