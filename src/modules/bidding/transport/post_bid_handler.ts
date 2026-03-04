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
} from "../application/place_bid_service";
import { prismaSqlTransactionRunner } from "../../../infrastructure/database/prisma_sql_runner";

const bidRequestPayloadSchema = z.object({
  auction_id: z.string().min(1),
  company_id: z.string().min(1),
  user_id: z.string().min(1),
  amount: z.coerce.number().positive(),
});

type BidRequestPayload = z.infer<typeof bidRequestPayloadSchema>;

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

function normalizeAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
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
          body: {
            error_code: bidErrorCodes.missingIdempotencyKey,
            message: "Idempotency-Key header is required",
          },
        });
      }

      let requestBody: unknown;

      try {
        requestBody = await request.json();
      } catch {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.invalidPayload,
          body: {
            error_code: bidErrorCodes.invalidPayload,
            message: "Request body must be valid JSON",
          },
        });
      }

      const parsedBody = bidRequestPayloadSchema.safeParse(requestBody);

      if (!parsedBody.success) {
        return jsonResult({
          status: 400,
          errorCode: bidErrorCodes.invalidPayload,
          body: {
            error_code: bidErrorCodes.invalidPayload,
            message: parsedBody.error.issues.map((issue) => issue.message).join("; "),
          },
        });
      }

      const payload = parsedBody.data;
      payload.amount = normalizeAmount(payload.amount);
      parsedPayload = payload;

      const disableFlag = await dependencies.readDisableBiddingFlagFn();

      if (disableFlag.disabled) {
        return jsonResult({
          status: 503,
          errorCode: bidErrorCodes.biddingDisabled,
          body: {
            error_code: bidErrorCodes.biddingDisabled,
            message: "Bidding is temporarily disabled",
          },
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
          body: {
            error_code: bidErrorCodes.bidRateLimited,
            message: "Bid request exceeded rate limit",
            exceeded_scopes: rateLimitDecision.exceeded,
          },
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
          body: {
            error_code: bidErrorCodes.idempotencyConflict,
            message: "Idempotency key reuse with different payload",
          },
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
            body: {
              error_code: bidErrorCodes.bidFloodProtected,
              message: "Bid flood protection triggered",
            },
          });
        }

        return jsonResult({
          status: 409,
          errorCode: bidErrorCodes.bidContentionConflict,
          body: {
            error_code: bidErrorCodes.bidContentionConflict,
            message: "Bid contention conflict. Retry with same idempotency key",
          },
        });
      }

      return jsonResult({
        status: 500,
        errorCode: bidErrorCodes.internalError,
        body: {
          error_code: bidErrorCodes.internalError,
          message: "Unexpected internal error",
        },
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
