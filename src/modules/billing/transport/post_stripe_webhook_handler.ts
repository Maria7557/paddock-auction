import { createHash } from "node:crypto";

import { DomainError } from "../../../lib/domain_errors";
import { env } from "../../../lib/env";
import { prismaSqlTransactionRunner } from "../../../infrastructure/database/prisma_sql_runner";
import { createStripeWebhookService, type StripeWebhookService } from "../application/stripe_webhook_service";
import { billingErrorCodes } from "../domain/billing_error_codes";
import { verifyStripeSignature } from "../domain/stripe_signature";
import { incrementGuardrailCounter } from "../../platform/domain/metrics";

type StripeWebhookHandlerResponse = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

function jsonResult(result: StripeWebhookHandlerResponse): Response {
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

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractStringField(payload: Record<string, unknown>, fieldName: string): string | null {
  const value = payload[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractOccurredAt(payload: Record<string, unknown>, fallback: Date): Date {
  const created = payload.created;

  if (typeof created === "number" && Number.isFinite(created)) {
    return new Date(Math.floor(created) * 1000);
  }

  return fallback;
}

function extractPaymentIntentId(eventType: string, payload: Record<string, unknown>): string | null {
  if (eventType !== "payment_intent.succeeded") {
    return null;
  }

  const data = payload.data;

  if (!isRecord(data)) {
    return null;
  }

  const object = data.object;

  if (!isRecord(object)) {
    return null;
  }

  return extractStringField(object, "id");
}

function extractStripeChargeId(payload: Record<string, unknown>): string | null {
  const data = payload.data;

  if (!isRecord(data)) {
    return null;
  }

  const object = data.object;

  if (!isRecord(object)) {
    return null;
  }

  const latestCharge = extractStringField(object, "latest_charge");

  if (latestCharge !== null) {
    return latestCharge;
  }

  const charges = object.charges;

  if (!isRecord(charges) || !Array.isArray(charges.data) || charges.data.length === 0) {
    return null;
  }

  const firstCharge = charges.data[0];

  if (!isRecord(firstCharge)) {
    return null;
  }

  return extractStringField(firstCharge, "id");
}

export type PostStripeWebhookHandlerDependencies = {
  stripeWebhookService: Pick<StripeWebhookService, "processStripeWebhook">;
  verifyStripeSignatureFn: (payload: string, signatureHeader: string | null) => boolean;
  now: () => Date;
};

export function createPostStripeWebhookHandler(
  dependencies: PostStripeWebhookHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const rawPayload = await request.text();
    const signatureHeader = request.headers.get("stripe-signature");

    if (!dependencies.verifyStripeSignatureFn(rawPayload, signatureHeader)) {
      return jsonResult({
        status: 400,
        errorCode: billingErrorCodes.invalidStripeSignature,
        body: {
          error_code: billingErrorCodes.invalidStripeSignature,
          message: "Stripe webhook signature verification failed",
        },
      });
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawPayload) as unknown;
    } catch {
      return jsonResult({
        status: 400,
        errorCode: billingErrorCodes.invalidStripeEventPayload,
        body: {
          error_code: billingErrorCodes.invalidStripeEventPayload,
          message: "Webhook payload must be valid JSON",
        },
      });
    }

    if (!isRecord(parsedPayload)) {
      return jsonResult({
        status: 400,
        errorCode: billingErrorCodes.invalidStripeEventPayload,
        body: {
          error_code: billingErrorCodes.invalidStripeEventPayload,
          message: "Webhook payload must be a JSON object",
        },
      });
    }

    const stripeEventId = extractStringField(parsedPayload, "id");
    const eventType = extractStringField(parsedPayload, "type");

    if (!stripeEventId || !eventType) {
      return jsonResult({
        status: 400,
        errorCode: billingErrorCodes.invalidStripeEventPayload,
        body: {
          error_code: billingErrorCodes.invalidStripeEventPayload,
          message: "Webhook payload is missing required id/type fields",
        },
      });
    }

    const occurredAt = extractOccurredAt(parsedPayload, dependencies.now());

    try {
      const processingResult = await dependencies.stripeWebhookService.processStripeWebhook({
        stripeEventId,
        eventType,
        payloadHash: hashPayload(rawPayload),
        paymentIntentId: extractPaymentIntentId(eventType, parsedPayload),
        stripeChargeId: extractStripeChargeId(parsedPayload),
        occurredAt,
        eventPayload: parsedPayload,
      });

      if (processingResult.kind === "duplicate") {
        incrementGuardrailCounter("stripe_webhook_dedupe_total");

        return jsonResult({
          status: 200,
          body: {
            result: "noop",
            reason: "duplicate_event",
          },
        });
      }

      if (processingResult.kind === "ignored") {
        return jsonResult({
          status: 200,
          body: {
            result: "noop",
            reason: processingResult.reason,
          },
        });
      }

      return jsonResult({
        status: 200,
        body: {
          result: "applied",
          auction_id: processingResult.auctionId,
          invoice_id: processingResult.invoiceId,
          payment_id: processingResult.paymentId,
          deposit_lock_id: processingResult.depositLockId,
          transition_id: processingResult.transitionId,
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

const defaultStripeWebhookService = createStripeWebhookService(prismaSqlTransactionRunner);

export const postStripeWebhookHandler = createPostStripeWebhookHandler({
  stripeWebhookService: defaultStripeWebhookService,
  verifyStripeSignatureFn: (payload, signatureHeader) =>
    verifyStripeSignature(
      payload,
      signatureHeader,
      env.STRIPE_WEBHOOK_SIGNING_SECRET,
      Math.floor(Date.now() / 1000),
    ),
  now: () => new Date(),
});
