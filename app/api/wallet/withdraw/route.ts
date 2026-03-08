import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { postWalletWithdrawHandler } from "@/src/modules/wallet/withdraw_controller";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postWalletWithdrawHandler(request);
});
