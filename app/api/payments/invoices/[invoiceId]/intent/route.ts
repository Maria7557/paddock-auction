import { postPaymentIntentHandler } from "@/src/modules/billing/transport/post_payment_intent_handler";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

type RouteContext = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

async function resolveInvoiceId(context: RouteContext): Promise<string> {
  const resolved = await Promise.resolve(context.params);
  return resolved.invoiceId;
}

export const POST = withStructuredMutationLogging(async (request: Request, context: RouteContext) => {
  const invoiceId = await resolveInvoiceId(context);
  return postPaymentIntentHandler(request, invoiceId);
});
