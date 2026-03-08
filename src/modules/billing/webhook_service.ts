import { env } from "../../lib/env";
import { prismaSqlTransactionRunner } from "../../infrastructure/database/prisma_sql_runner";
import {
  createStripeWebhookService,
  type StripeWebhookService,
} from "./application/stripe_webhook_service";
import { verifyStripeSignature } from "./domain/stripe_signature";
import { createPostStripeWebhookHandler } from "./transport/post_stripe_webhook_handler";

export type BillingWebhookService = {
  handleWebhook(request: Request): Promise<Response>;
};

export type CreateBillingWebhookServiceDependencies = {
  stripeWebhookService: Pick<StripeWebhookService, "processStripeWebhook">;
  verifyStripeSignatureFn: (payload: string, signatureHeader: string | null) => boolean;
  now: () => Date;
};

export function createBillingWebhookService(
  dependencies: CreateBillingWebhookServiceDependencies,
): BillingWebhookService {
  const handler = createPostStripeWebhookHandler({
    stripeWebhookService: dependencies.stripeWebhookService,
    verifyStripeSignatureFn: dependencies.verifyStripeSignatureFn,
    now: dependencies.now,
  });

  return {
    handleWebhook: async (request) => handler(request),
  };
}

const defaultStripeWebhookService = createStripeWebhookService(prismaSqlTransactionRunner);

const defaultBillingWebhookService = createBillingWebhookService({
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

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
  return defaultBillingWebhookService.handleWebhook(request);
}
