import { config } from "dotenv";
import { z } from "zod";

config({ quiet: true });

const booleanEnvSchema = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "must be true or false",
  });

  return z.NEVER;
});

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .startsWith("postgresql://", "DATABASE_URL must start with postgresql://"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL must not be empty")
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must start with redis:// or rediss://",
    )
    .default("redis://127.0.0.1:6379"),
  BID_LIMIT_USER_PER_10S: z.coerce.number().int().positive().default(15),
  BID_LIMIT_COMPANY_PER_10S: z.coerce.number().int().positive().default(20),
  BID_LIMIT_IP_PER_10S: z.coerce.number().int().positive().default(60),
  BID_FLOOD_CONFLICT_THRESHOLD_10S: z.coerce.number().int().positive().default(50),
  BID_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(250),
  BID_PG_RETRY_MAX: z.coerce.number().int().nonnegative().default(2),
  DISABLE_BIDDING_DEFAULT: booleanEnvSchema.default(false),
  BID_ERROR_RATE_BREAKER_THRESHOLD_PCT: z.coerce.number().min(0).max(100).default(8),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SIGNING_SECRET: z.string().default(""),
  STRIPE_API_BASE_URL: z.string().url().default("https://api.stripe.com/v1"),
});

const parsedEnv = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  REDIS_URL: process.env.REDIS_URL,
  BID_LIMIT_USER_PER_10S: process.env.BID_LIMIT_USER_PER_10S,
  BID_LIMIT_COMPANY_PER_10S: process.env.BID_LIMIT_COMPANY_PER_10S,
  BID_LIMIT_IP_PER_10S: process.env.BID_LIMIT_IP_PER_10S,
  BID_FLOOD_CONFLICT_THRESHOLD_10S: process.env.BID_FLOOD_CONFLICT_THRESHOLD_10S,
  BID_LOCK_TIMEOUT_MS: process.env.BID_LOCK_TIMEOUT_MS,
  BID_PG_RETRY_MAX: process.env.BID_PG_RETRY_MAX,
  DISABLE_BIDDING_DEFAULT: process.env.DISABLE_BIDDING_DEFAULT,
  BID_ERROR_RATE_BREAKER_THRESHOLD_PCT: process.env.BID_ERROR_RATE_BREAKER_THRESHOLD_PCT,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SIGNING_SECRET: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
  STRIPE_API_BASE_URL: process.env.STRIPE_API_BASE_URL,
});

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment variables: ${details}`);
}

export const env = parsedEnv.data;

export type Env = typeof env;
