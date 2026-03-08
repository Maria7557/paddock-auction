import assert from "node:assert/strict";
import test from "node:test";

import type { StripeWebhookProcessInput } from "./infrastructure/stripe_webhook_sql_repository";
import { billingErrorCodes } from "./domain/billing_error_codes";
import { createBillingWebhookService } from "./webhook_service";

function buildWebhookRequest(payload: Record<string, unknown>, signature: string): Request {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: JSON.stringify(payload),
  });
}

async function parseResponse(
  response: Response,
): Promise<{ status: number; body: Record<string, unknown>; errorCode: string | null }> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    errorCode: response.headers.get("x-error-code"),
  };
}

test("handleWebhook rejects webhook when signature verification fails", async () => {
  const service = createBillingWebhookService({
    stripeWebhookService: {
      processStripeWebhook: async () => {
        throw new Error("processStripeWebhook must not be called when signature is invalid");
      },
    },
    verifyStripeSignatureFn: () => false,
    now: () => new Date("2026-03-06T10:00:00.000Z"),
  });

  const response = await parseResponse(
    await service.handleWebhook(
      buildWebhookRequest(
        {
          id: "evt_invalid_signature",
          type: "payment_intent.succeeded",
        },
        "invalid-signature",
      ),
    ),
  );

  assert.equal(response.status, 400);
  assert.equal(response.errorCode, billingErrorCodes.invalidStripeSignature);
  assert.equal(response.body.error_code, billingErrorCodes.invalidStripeSignature);
});

test("handleWebhook processes payment_intent.succeeded and returns applied response", async () => {
  let processInput: StripeWebhookProcessInput | null = null;

  const service = createBillingWebhookService({
    stripeWebhookService: {
      processStripeWebhook: async (input) => {
        processInput = input;

        return {
          kind: "applied",
          auctionId: "auction-webhook-service-1",
          invoiceId: "invoice-webhook-service-1",
          paymentId: "payment-webhook-service-1",
          depositLockId: "lock-webhook-service-1",
          transitionId: "transition-webhook-service-1",
        };
      },
    },
    verifyStripeSignatureFn: () => true,
    now: () => new Date("2026-03-06T12:00:00.000Z"),
  });

  const response = await parseResponse(
    await service.handleWebhook(
      buildWebhookRequest(
        {
          id: "evt_success_service_1",
          type: "payment_intent.succeeded",
          created: 1_772_345_120,
          data: {
            object: {
              id: "pi_service_1",
              latest_charge: "ch_service_1",
            },
          },
        },
        "test-signature",
      ),
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.result, "applied");
  assert.equal(response.body.invoice_id, "invoice-webhook-service-1");

  assert.ok(processInput);
  const capturedInput = processInput as StripeWebhookProcessInput;
  assert.equal(capturedInput.stripeEventId, "evt_success_service_1");
  assert.equal(capturedInput.eventType, "payment_intent.succeeded");
  assert.equal(capturedInput.paymentIntentId, "pi_service_1");
  assert.equal(capturedInput.stripeChargeId, "ch_service_1");
});
