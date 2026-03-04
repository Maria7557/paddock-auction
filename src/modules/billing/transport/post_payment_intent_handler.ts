import { DomainError } from "../../../lib/domain_errors";
import { env } from "../../../lib/env";
import { prismaSqlTransactionRunner } from "../../../infrastructure/database/prisma_sql_runner";
import { createPaymentIntentService, type PaymentIntentService } from "../application/payment_intent_service";
import { billingErrorCodes } from "../domain/billing_error_codes";
import {
  createStripePaymentIntentGateway,
  type CreateStripePaymentIntentFn,
} from "../infrastructure/stripe_payment_intent_gateway";

type PaymentIntentResponse = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

function jsonResult(result: PaymentIntentResponse): Response {
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

export type PostPaymentIntentHandlerDependencies = {
  paymentIntentService: Pick<PaymentIntentService, "createInvoicePaymentIntent">;
  now: () => Date;
};

export function createPostPaymentIntentHandler(
  dependencies: PostPaymentIntentHandlerDependencies,
): (request: Request, invoiceId: string) => Promise<Response> {
  return async (request: Request, invoiceId: string): Promise<Response> => {
    try {
      const idempotencyKey = request.headers.get("idempotency-key")?.trim();

      if (!idempotencyKey) {
        return jsonResult({
          status: 400,
          errorCode: billingErrorCodes.missingIdempotencyKey,
          body: {
            error_code: billingErrorCodes.missingIdempotencyKey,
            message: "Idempotency-Key header is required",
          },
        });
      }

      if (!invoiceId || invoiceId.trim().length === 0) {
        return jsonResult({
          status: 400,
          errorCode: billingErrorCodes.invalidPaymentIntentRequest,
          body: {
            error_code: billingErrorCodes.invalidPaymentIntentRequest,
            message: "invoiceId route parameter is required",
          },
        });
      }

      const result = await dependencies.paymentIntentService.createInvoicePaymentIntent({
        invoiceId,
        idempotencyKey,
        occurredAt: dependencies.now(),
      });

      return jsonResult({
        status: 200,
        body: {
          result: "accepted",
          replayed: result.replayed,
          invoice_id: result.invoiceId,
          payment_id: result.paymentId,
          stripe_payment_intent_id: result.stripePaymentIntentId,
          client_secret: result.clientSecret,
          amount: result.amount,
          currency: result.currency,
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

const stripePaymentIntentGateway: CreateStripePaymentIntentFn = createStripePaymentIntentGateway({
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeApiBaseUrl: env.STRIPE_API_BASE_URL,
});

const defaultPaymentIntentService = createPaymentIntentService(
  prismaSqlTransactionRunner,
  stripePaymentIntentGateway,
);

export const postPaymentIntentHandler = createPostPaymentIntentHandler({
  paymentIntentService: defaultPaymentIntentService,
  now: () => new Date(),
});
