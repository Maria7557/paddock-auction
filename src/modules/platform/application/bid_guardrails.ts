import { env } from "../../../lib/env";
import {
  getRedisClientOrNull,
  redisRuntimeKeys,
  type RedisGuardrailClient,
} from "../infrastructure/redis/client";

const BID_RATE_LIMIT_WINDOW_SECONDS = 10;

type RateLimitScope = "user" | "company" | "ip";

type BidRateLimitCounts = {
  user: number;
  company: number;
  ip: number;
};

type BidRateLimitLimits = {
  user: number;
  company: number;
  ip: number;
};

export type DisableBiddingFlagState = {
  disabled: boolean;
  key: typeof redisRuntimeKeys.disableBiddingFlag;
  source: "redis" | "default";
};

export type BidRateLimitDecision = {
  allowed: boolean;
  degraded: boolean;
  keys: {
    user: string;
    company: string;
    ip: string;
  };
  limits: BidRateLimitLimits;
  counts: BidRateLimitCounts | null;
  exceeded: RateLimitScope[];
};

export type BidFloodConflictDecision = {
  count: number | null;
  degraded: boolean;
  key: string;
};

export type BidRateLimitInput = {
  userId: string;
  companyId: string;
  ip: string;
};

const incrementRateLimitScript = `
local ttl = tonumber(ARGV[1])
local counts = {}
for index, key in ipairs(KEYS) do
  local current = redis.call("INCR", key)
  if current == 1 then
    redis.call("EXPIRE", key, ttl)
  end
  counts[index] = current
end
return counts
`;

const incrementFloodCounterScript = `
local ttl = tonumber(ARGV[1])
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ttl)
end
return current
`;

function parseBooleanFlag(rawValue: string | null): boolean | null {
  if (rawValue === null) {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Unable to coerce Redis count value: ${String(value)}`);
}

function parseRateLimitCounts(rawCounts: unknown): BidRateLimitCounts {
  if (!Array.isArray(rawCounts) || rawCounts.length !== 3) {
    throw new Error("Redis rate limit script returned unexpected payload");
  }

  return {
    user: coerceNumber(rawCounts[0]),
    company: coerceNumber(rawCounts[1]),
    ip: coerceNumber(rawCounts[2]),
  };
}

function evaluateExceededScopes(
  counts: BidRateLimitCounts,
  limits: BidRateLimitLimits,
): RateLimitScope[] {
  const exceeded: RateLimitScope[] = [];

  if (counts.user > limits.user) {
    exceeded.push("user");
  }

  if (counts.company > limits.company) {
    exceeded.push("company");
  }

  if (counts.ip > limits.ip) {
    exceeded.push("ip");
  }

  return exceeded;
}

export async function readDisableBiddingFlag(
  redisClient?: RedisGuardrailClient | null,
): Promise<DisableBiddingFlagState> {
  const client = redisClient === undefined ? await getRedisClientOrNull() : redisClient;

  if (client === null) {
    return {
      disabled: env.DISABLE_BIDDING_DEFAULT,
      key: redisRuntimeKeys.disableBiddingFlag,
      source: "default",
    };
  }

  try {
    const rawValue = await client.get(redisRuntimeKeys.disableBiddingFlag);
    const parsed = parseBooleanFlag(rawValue);

    if (parsed === null) {
      return {
        disabled: env.DISABLE_BIDDING_DEFAULT,
        key: redisRuntimeKeys.disableBiddingFlag,
        source: "default",
      };
    }

    return {
      disabled: parsed,
      key: redisRuntimeKeys.disableBiddingFlag,
      source: "redis",
    };
  } catch {
    return {
      disabled: env.DISABLE_BIDDING_DEFAULT,
      key: redisRuntimeKeys.disableBiddingFlag,
      source: "default",
    };
  }
}

export async function incrementBidRateLimits(
  input: BidRateLimitInput,
  redisClient?: RedisGuardrailClient | null,
): Promise<BidRateLimitDecision> {
  const keys = {
    user: redisRuntimeKeys.bidRateLimitUser(input.userId),
    company: redisRuntimeKeys.bidRateLimitCompany(input.companyId),
    ip: redisRuntimeKeys.bidRateLimitIp(input.ip),
  };

  const limits = {
    user: env.BID_LIMIT_USER_PER_10S,
    company: env.BID_LIMIT_COMPANY_PER_10S,
    ip: env.BID_LIMIT_IP_PER_10S,
  };

  const client = redisClient === undefined ? await getRedisClientOrNull() : redisClient;

  if (client === null) {
    return {
      allowed: true,
      degraded: true,
      keys,
      limits,
      counts: null,
      exceeded: [],
    };
  }

  try {
    const rawCounts = await client.eval(incrementRateLimitScript, {
      keys: [keys.user, keys.company, keys.ip],
      arguments: [String(BID_RATE_LIMIT_WINDOW_SECONDS)],
    });

    const counts = parseRateLimitCounts(rawCounts);
    const exceeded = evaluateExceededScopes(counts, limits);

    return {
      allowed: exceeded.length === 0,
      degraded: false,
      keys,
      limits,
      counts,
      exceeded,
    };
  } catch {
    return {
      allowed: true,
      degraded: true,
      keys,
      limits,
      counts: null,
      exceeded: [],
    };
  }
}

export async function incrementBidFloodConflicts(
  auctionId: string,
  redisClient?: RedisGuardrailClient | null,
): Promise<BidFloodConflictDecision> {
  const key = redisRuntimeKeys.bidFloodAuctionConflicts(auctionId);
  const client = redisClient === undefined ? await getRedisClientOrNull() : redisClient;

  if (client === null) {
    return {
      count: null,
      degraded: true,
      key,
    };
  }

  try {
    const rawResult = await client.eval(incrementFloodCounterScript, {
      keys: [key],
      arguments: [String(BID_RATE_LIMIT_WINDOW_SECONDS)],
    });

    return {
      count: coerceNumber(rawResult),
      degraded: false,
      key,
    };
  } catch {
    return {
      count: null,
      degraded: true,
      key,
    };
  }
}

export const bidGuardrailRuntime = {
  BID_RATE_LIMIT_WINDOW_SECONDS,
};
