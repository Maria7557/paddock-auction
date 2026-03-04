import { randomUUID } from "node:crypto";

import { DomainError } from "../../../lib/domain_errors";
import { prismaSqlTransactionRunner } from "../../../infrastructure/database/prisma_sql_runner";
import {
  createPaymentDeadlineEnforcementService,
  type PaymentDeadlineEnforcementService,
} from "../application/payment_deadline_enforcement_service";
import { billingErrorCodes } from "../domain/billing_error_codes";

const CORRELATION_ID_HEADER = "x-correlation-id";

export type PostPaymentDeadlineEnforcementDependencies = {
  paymentDeadlineEnforcementService: Pick<PaymentDeadlineEnforcementService, "enforceDuePaymentDeadlines">;
  now: () => Date;
};

type EnforcementResponse = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

function jsonResult(result: EnforcementResponse): Response {
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

function parseBatchSize(request: Request): number | undefined {
  const url = new URL(request.url);
  const queryValue = url.searchParams.get("batch_size");

  if (!queryValue) {
    return undefined;
  }

  const parsed = Number(queryValue);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.floor(parsed);
}

function logDeadlineResult(input: {
  correlationId: string;
  route: string;
  result: string;
  auctionId: string;
  companyId: string;
  durationMs: number;
}): void {
  console.info(
    JSON.stringify({
      correlation_id: input.correlationId,
      auction_id: input.auctionId,
      company_id: input.companyId,
      route: input.route,
      result: input.result,
      duration_ms: input.durationMs,
    }),
  );
}

export function createPostPaymentDeadlineEnforcementHandler(
  dependencies: PostPaymentDeadlineEnforcementDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const route = new URL(request.url).pathname;
    const correlationId = request.headers.get(CORRELATION_ID_HEADER)?.trim() || randomUUID();

    try {
      const executionResult = await dependencies.paymentDeadlineEnforcementService.enforceDuePaymentDeadlines({
        occurredAt: dependencies.now(),
        batchSize: parseBatchSize(request),
      });

      for (const item of executionResult.items) {
        logDeadlineResult({
          correlationId,
          route,
          result: item.result,
          auctionId: item.auctionId,
          companyId: item.companyId,
          durationMs: item.durationMs,
        });
      }

      return jsonResult({
        status: 200,
        body: {
          result: "success",
          processed_count: executionResult.processedCount,
          defaulted_count: executionResult.defaultedCount,
          paid_count: executionResult.paidCount,
          noop_count: executionResult.noopCount,
        },
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return jsonResult({
          status: error.status,
          errorCode: error.code,
          body: {
            error_code: error.code,
            message: error.message,
          },
        });
      }

      return jsonResult({
        status: 500,
        errorCode: billingErrorCodes.internalError,
        body: {
          error_code: billingErrorCodes.internalError,
          message: "Unexpected internal error",
        },
      });
    }
  };
}

const defaultPaymentDeadlineEnforcementService = createPaymentDeadlineEnforcementService(
  prismaSqlTransactionRunner,
);

export const postPaymentDeadlineEnforcementHandler = createPostPaymentDeadlineEnforcementHandler({
  paymentDeadlineEnforcementService: defaultPaymentDeadlineEnforcementService,
  now: () => new Date(),
});
