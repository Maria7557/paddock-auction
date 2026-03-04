import { postPaymentDeadlineEnforcementHandler } from "@/src/modules/billing/transport/post_payment_deadline_enforcement_handler";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postPaymentDeadlineEnforcementHandler(request);
});
