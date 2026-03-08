import { z } from "zod";

import { env } from "../../../lib/env";
import {
  incrementGuardrailCounter,
  observeGuardrailHistogram,
} from "../../platform/domain/metrics";
import {
  incrementBidFloodConflicts,
  incrementBidRateLimits,
  readDisableBiddingFlag,
  type BidRateLimitDecision,
  type DisableBiddingFlagState,
} from "../../platform/application/bid_guardrails";
import { createBidRequestHash } from "../domain/bid_request_hash";
import { bidErrorCodes } from "../domain/bid_error_codes";
import { BidContentionConflictError } from "../domain/bid_domain_errors";
import {
  createPlaceBidService,
  type PlaceBidCommand,
  type PlaceBidService,
} from "../bid_service";
import { prismaSqlTransactionRunner } from "../../../infrastructure/database/prisma_sql_runner";
import { normalizeBidAmount } from "../domain/bid_validation";

const bidRequestBodySchema = z.object({
  auctionId: z.string().trim().min(1).optional(),
  auction_id: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  company_id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive(),
});

type BidRequestBody = z.infer<typeof bidRequestBodySchema>;

type BidRequestPayload = {
  auction_id: string;
  company_id: string;
  user_id: string;
  amount: number;
};

type BidRequestResult = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
  lockWaitMs?: number;
};

function jsonResult(result: BidRequestResult): Response {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (result.errorCode) {
    headers.set("x-error-code", result.errorCode);
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}

function parseClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function cleanOptionalValue(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function decodeBase64UrlSegment(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function parseJwtPayload(authorizationHeader: string | null): Record<string, unknown> | null {
  const raw = cleanOptionalValue(authorizationHeader);

  if (!raw || !raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = raw.slice("bearer ".length).trim();

  if (!token) {
    return null;
  }

  const segments = token.split(".");

  if (segments.length < 2) {
    return null;
  }

  const decodedPayload = decodeBase64UrlSegment(segments[1]);

  if (!decodedPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodedPayload) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickStringClaim(
  payload: Record<string, unknown> | null,
  keys: readonly string[],
): string | undefined {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string") {
      const normalized = cleanOptionalValue(value);

      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function resolveAuthenticatedUserId(request: Request): string | undefined {
  const jwtPayload = parseJwtPayload(request.headers.get("authorization"));

  return (
    cleanOptionalValue(request.headers.get("x-user-id")) ??
    cleanOptionalValue(request.headers.get("user-id")) ??
    pickStringClaim(jwtPayload, ["sub", "user_id", "userId", "uid"]) ??
    undefined
  );
}

function resolveCompanyId(request: Request, body: BidRequestBody): string | undefined {
  const jwtPayload = parseJwtPayload(request.headers.get("authorization"));

  return (
    cleanOptionalValue(request.headers.get("x-company-id")) ??
    cleanOptionalValue(request.headers.get("company-id")) ??
    pickStringClaim(jwtPayload, ["company_id", "companyId", "org_id", "organization_id"]) ??
    cleanOptionalValue(body.companyId) ??
    cleanOptionalValue(body.company_id) ??
    undefined
  );
}

function errorBody(
  errorCode: string,
  message: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    error: errorCode,
    error_code: errorCode,
    message,
    ...extra,
  };
}

export type PostBidHandlerDependencies = {
  placeBidService: Pick<PlaceBidService, "placeBid">;
  readDisableBiddingFlagFn: () => Promise<DisableBiddingFlagState>;
  incrementBidRateLimitsFn: (input: {
    userId: string;
    companyId: string;
    ip: string;
  }) => Promise<BidRateLimitDecision>;
  incrementBidFloodConflictsFn: (auctionId: string) => Promise<{ count: number | null }>;
  bidFloodConflictThreshold: number;
  now: () => Date;
};

export function createPostBidHandler(dependencies: PostBidHandlerDependencies): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    let parsedPayload: BidRequestPayload | null = null;

    try {
      const idempotencyKey = request.headers.get("idempotency-key")?.trim();

      if (!idempotencyKey) {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.missingIdempotencyKey,
          body: errorBody(
            bidErrorCodes.missingIdempotencyKey,
            "Idempotency-Key header is required",
          ),
        });
      }

      let requestBody: unknown;

      try {
        requestBody = await request.json();
      } catch {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.invalidPayload,
          body: errorBody(bidErrorCodes.invalidPayload, "Request body must be valid JSON"),
        });
      }

      const parsedBody = bidRequestBodySchema.safeParse(requestBody);

      if (!parsedBody.success) {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.invalidPayload,
          body: errorBody(
            bidErrorCodes.invalidPayload,
            parsedBody.error.issues.map((issue) => issue.message).join("; "),
          ),
        });
      }

      const requestPayload = parsedBody.data;
      const auctionId =
        cleanOptionalValue(requestPayload.auctionId) ??
        cleanOptionalValue(requestPayload.auction_id);
      const userId = resolveAuthenticatedUserId(request);
      const companyId = resolveCompanyId(request, requestPayload);

      if (!userId) {
        return jsonResult({
          status: 401,
          errorCode: bidErrorCodes.unauthenticated,
          body: errorBody(
            bidErrorCodes.unauthenticated,
            "Authenticated user context is required",
          ),
        });
      }

      if (!auctionId || !companyId) {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.invalidPayload,
          body: errorBody(
            bidErrorCodes.invalidPayload,
            "auctionId and companyId are required",
          ),
        });
      }

      const payload: BidRequestPayload = {
        auction_id: auctionId,
        company_id: companyId,
        user_id: userId,
        amount: normalizeBidAmount(requestPayload.amount),
      };
      parsedPayload = payload;

      const disableFlag = await dependencies.readDisableBiddingFlagFn();

      if (disableFlag.disabled) {
        return jsonResult({
          status: 503,
          errorCode: bidErrorCodes.biddingDisabled,
          body: errorBody(bidErrorCodes.biddingDisabled, "Bidding is temporarily disabled"),
        });
      }

      const ip = parseClientIp(request);
      const rateLimitDecision = await dependencies.incrementBidRateLimitsFn({
        userId: payload.user_id,
        companyId: payload.company_id,
        ip,
      });

      if (!rateLimitDecision.allowed) {
        incrementGuardrailCounter("bid_rate_limited_total");

        return jsonResult({
          status: 429,
          errorCode: bidErrorCodes.bidRateLimited,
          body: errorBody(
            bidErrorCodes.bidRateLimited,
            "Bid request exceeded rate limit",
            {
              exceeded_scopes: rateLimitDecision.exceeded,
            },
          ),
        });
      }

      const requestHash = createBidRequestHash({
        auctionId: payload.auction_id,
        companyId: payload.company_id,
        userId: payload.user_id,
        amount: payload.amount,
      });

      const placeBidCommand: PlaceBidCommand = {
        auctionId: payload.auction_id,
        companyId: payload.company_id,
        userId: payload.user_id,
        amount: payload.amount,
        idempotencyKey,
        requestHash,
        occurredAt: dependencies.now(),
      };

      const bidResult = await dependencies.placeBidService.placeBid(placeBidCommand);

      if (bidResult.lockWaitMs >= 0) {
        observeGuardrailHistogram("bid_lock_wait_ms", bidResult.lockWaitMs);
      }

      if (bidResult.kind === "idempotency_conflict") {
        incrementGuardrailCounter("bid_idempotency_conflict_total");

        return jsonResult({
          status: 409,
          errorCode: bidErrorCodes.idempotencyConflict,
          body: errorBody(
            bidErrorCodes.idempotencyConflict,
            "Idempotency key reuse with different payload",
          ),
        });
      }

      if (bidResult.kind === "replay") {
        return jsonResult({
          status: bidResult.responseStatus,
          body: bidResult.responseBody,
        });
      }

      if (bidResult.kind === "rejected") {
        return jsonResult({
          status: bidResult.responseStatus,
          errorCode: bidResult.errorCode,
          body: bidResult.responseBody,
        });
      }

      return jsonResult({
        status: bidResult.responseStatus,
        body: bidResult.responseBody,
      });
    } catch (error) {
      if (error instanceof BidContentionConflictError) {
        observeGuardrailHistogram("bid_lock_wait_ms", Math.max(0, error.lockWaitMs));

        const floodDecision = await dependencies.incrementBidFloodConflictsFn(
          parsedPayload?.auction_id ?? "unknown",
        );

        if (
          floodDecision.count !== null &&
          floodDecision.count >= dependencies.bidFloodConflictThreshold
        ) {
          incrementGuardrailCounter("bid_flood_rejected_total");

          return jsonResult({
            status: 429,
            errorCode: bidErrorCodes.bidFloodProtected,
            body: errorBody(bidErrorCodes.bidFloodProtected, "Bid flood protection triggered"),
          });
        }

        return jsonResult({
          status: 409,
          errorCode: bidErrorCodes.bidContentionConflict,
          body: errorBody(
            bidErrorCodes.bidContentionConflict,
            "Bid contention conflict. Retry with same idempotency key",
          ),
        });
      }

      return jsonResult({
        status: 500,
        errorCode: bidErrorCodes.internalError,
        body: errorBody(bidErrorCodes.internalError, "Unexpected internal error"),
      });
    } finally {
      observeGuardrailHistogram("bid_request_duration_ms", Date.now() - startedAt);
    }
  };
}

const defaultPlaceBidService = createPlaceBidService(
  prismaSqlTransactionRunner,
  env.BID_LOCK_TIMEOUT_MS,
  env.BID_PG_RETRY_MAX,
);

export const postBidHandler = createPostBidHandler({
  placeBidService: defaultPlaceBidService,
  readDisableBiddingFlagFn: async () => readDisableBiddingFlag(),
  incrementBidRateLimitsFn: async (input) => incrementBidRateLimits(input),
  incrementBidFloodConflictsFn: async (auctionId: string) =>
    incrementBidFloodConflicts(auctionId),
  bidFloodConflictThreshold: env.BID_FLOOD_CONFLICT_THRESHOLD_10S,
  now: () => new Date(),
});
