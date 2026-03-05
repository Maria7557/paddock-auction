import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { postWalletDepositHandler } from "@/src/modules/wallet/wallet_controller";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postWalletDepositHandler(request);
});
