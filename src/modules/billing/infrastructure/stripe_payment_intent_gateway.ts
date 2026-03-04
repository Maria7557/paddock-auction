import { billingErrorCodes } from "../domain/billing_error_codes";
import { BillingUpstreamError } from "../domain/billing_domain_errors";

export type StripePaymentIntentRequest = {
  amount: number;
  currency: string;
  invoiceId: string;
  idempotencyKey: string;
};

export type StripePaymentIntentResponse = {
  stripePaymentIntentId: string;
  clientSecret: string | null;
};

export type CreateStripePaymentIntentFn = (
  input: StripePaymentIntentRequest,
) => Promise<StripePaymentIntentResponse>;

function toStripeAmountMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function createStripePaymentIntentGateway(input: {
  stripeSecretKey: string;
  stripeApiBaseUrl: string;
}): CreateStripePaymentIntentFn {
  return async ({ amount, currency, invoiceId, idempotencyKey }: StripePaymentIntentRequest) => {
    if (!input.stripeSecretKey || input.stripeSecretKey.trim().length === 0) {
      throw new BillingUpstreamError(
        billingErrorCodes.stripePaymentIntentFailed,
        "Stripe secret key is not configured",
      );
    }

    const body = new URLSearchParams();
    body.set("amount", String(toStripeAmountMinorUnits(amount)));
    body.set("currency", currency.toLowerCase());
    body.set("metadata[invoice_id]", invoiceId);
    body.set("automatic_payment_methods[enabled]", "true");

    const response = await fetch(`${input.stripeApiBaseUrl}/payment_intents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.stripeSecretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": idempotencyKey,
      },
      body,
    });

    const rawPayload = await response.text();

    let parsedPayload: Record<string, unknown>;

    try {
      parsedPayload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      parsedPayload = {};
    }

    if (!response.ok) {
      const stripeMessage =
        typeof parsedPayload.error === "object" &&
        parsedPayload.error &&
        "message" in parsedPayload.error &&
        typeof (parsedPayload.error as { message?: unknown }).message === "string"
          ? (parsedPayload.error as { message: string }).message
          : `Stripe API request failed with status ${response.status}`;

      throw new BillingUpstreamError(billingErrorCodes.stripePaymentIntentFailed, stripeMessage);
    }

    const stripePaymentIntentId =
      typeof parsedPayload.id === "string" ? parsedPayload.id : null;

    if (stripePaymentIntentId === null) {
      throw new BillingUpstreamError(
        billingErrorCodes.stripePaymentIntentFailed,
        "Stripe response did not include payment intent id",
      );
    }

    const clientSecret =
      typeof parsedPayload.client_secret === "string" ? parsedPayload.client_secret : null;

    return {
      stripePaymentIntentId,
      clientSecret,
    };
  };
}
