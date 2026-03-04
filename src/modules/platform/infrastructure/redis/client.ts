import { createClient } from "redis";
import { env } from "../../../../lib/env";

const REDIS_GUARDRAIL_ERROR_CODE = "REDIS_GUARDRAIL_UNAVAILABLE";

type RedisClient = ReturnType<typeof createClient>;

let cachedRedisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;

function sanitizeKeySegment(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error("Redis key segment must not be empty");
  }

  return normalized;
}

export const redisRuntimeKeys = {
  disableBiddingFlag: "flags:disable_bidding",
  bidRateLimitUser: (userId: string): string => `rl:bid:user:${sanitizeKeySegment(userId)}`,
  bidRateLimitCompany: (companyId: string): string =>
    `rl:bid:company:${sanitizeKeySegment(companyId)}`,
  bidRateLimitIp: (ip: string): string => `rl:bid:ip:${sanitizeKeySegment(ip)}`,
  bidFloodAuctionConflicts: (auctionId: string): string =>
    `flood:bid:auction:${sanitizeKeySegment(auctionId)}:conflicts`,
} as const;

function createRedisConnection(): RedisClient {
  const client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 250,
      reconnectStrategy: () => false,
    },
  });

  client.on("error", (error) => {
    console.error(
      JSON.stringify({
        event: "redis_client_error",
        error_code: REDIS_GUARDRAIL_ERROR_CODE,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  return client;
}

async function ensureRedisConnected(): Promise<RedisClient> {
  if (cachedRedisClient?.isOpen) {
    return cachedRedisClient;
  }

  if (cachedRedisClient === null) {
    cachedRedisClient = createRedisConnection();
  }

  if (cachedRedisClient.isOpen) {
    return cachedRedisClient;
  }

  if (redisConnectPromise === null) {
    redisConnectPromise = cachedRedisClient.connect().then(() => cachedRedisClient as RedisClient);
    redisConnectPromise.finally(() => {
      redisConnectPromise = null;
    });
  }

  return redisConnectPromise;
}

export async function getRedisClient(): Promise<RedisClient> {
  return ensureRedisConnected();
}

export async function getRedisClientOrNull(): Promise<RedisClient | null> {
  try {
    return await ensureRedisConnected();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "redis_client_unavailable",
        error_code: REDIS_GUARDRAIL_ERROR_CODE,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    return null;
  }
}

export async function disconnectRedisClient(): Promise<void> {
  if (cachedRedisClient?.isOpen) {
    await cachedRedisClient.quit();
  }

  cachedRedisClient = null;
  redisConnectPromise = null;
}

export type RedisGuardrailClient = Pick<RedisClient, "get" | "eval">;
