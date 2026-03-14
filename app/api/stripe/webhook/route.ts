import { handleStripeWebhookRequest } from "@/src/modules/billing/webhook_service";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return handleStripeWebhookRequest(request);
});
