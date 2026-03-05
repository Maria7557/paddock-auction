import assert from "node:assert/strict";
import test from "node:test";

import { createPaymentIntent } from "./payment_service";
import type { PaymentIntentRepository } from "./infrastructure/payment_intent_sql_repository";

test("createPaymentIntent returns replay response without creating new intent", async () => {
  let gatewayCalls = 0;

  const repository: Pick<PaymentIntentRepository, "preparePaymentIntent" | "attachStripePaymentIntent"> = {
    preparePaymentIntent: async () => ({
      kind: "replay",
      invoiceId: "invoice-1",
      paymentId: "payment-1",
      stripePaymentIntentId: "pi-existing-1",
      amount: 150,
      currency: "USD",
    }),
    attachStripePaymentIntent: async () => {
      throw new Error("attachStripePaymentIntent should not be called for replay");
    },
  };

  const result = await createPaymentIntent(
    repository,
    async () => {
      gatewayCalls += 1;
      return {
        stripePaymentIntentId: "pi-should-not-run",
        clientSecret: "secret-should-not-run",
      };
    },
    {
      invoiceId: "invoice-1",
      idempotencyKey: "idem-1",
      occurredAt: new Date("2026-03-05T10:00:00.000Z"),
    },
  );

  assert.equal(gatewayCalls, 0);
  assert.equal(result.replayed, true);
  assert.equal(result.clientSecret, null);
  assert.equal(result.stripePaymentIntentId, "pi-existing-1");
});

test("createPaymentIntent creates and attaches payment intent and returns clientSecret", async () => {
  let attachCalls = 0;

  const repository: Pick<PaymentIntentRepository, "preparePaymentIntent" | "attachStripePaymentIntent"> = {
    preparePaymentIntent: async () => ({
      kind: "create",
      invoiceId: "invoice-2",
      paymentId: "payment-2",
      amount: 300,
      currency: "USD",
    }),
    attachStripePaymentIntent: async ({ paymentId, stripePaymentIntentId }) => {
      attachCalls += 1;
      assert.equal(paymentId, "payment-2");
      assert.equal(stripePaymentIntentId, "pi-new-2");

      return {
        invoiceId: "invoice-2",
        paymentId: "payment-2",
        stripePaymentIntentId: "pi-new-2",
        amount: 300,
        currency: "USD",
      };
    },
  };

  const result = await createPaymentIntent(
    repository,
    async () => ({
      stripePaymentIntentId: "pi-new-2",
      clientSecret: "secret-new-2",
    }),
    {
      invoiceId: "invoice-2",
      idempotencyKey: "idem-2",
      occurredAt: new Date("2026-03-05T11:00:00.000Z"),
    },
  );

  assert.equal(attachCalls, 1);
  assert.equal(result.replayed, false);
  assert.equal(result.clientSecret, "secret-new-2");
  assert.equal(result.stripePaymentIntentId, "pi-new-2");
});
