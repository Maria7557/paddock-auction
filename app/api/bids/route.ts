import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { postBidHandler } from "@/src/modules/bidding/transport/post_bid_handler";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postBidHandler(request);
});
