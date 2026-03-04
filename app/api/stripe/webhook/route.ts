import { postStripeWebhookHandler } from "@/src/modules/billing/transport/post_stripe_webhook_handler";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postStripeWebhookHandler(request);
});
