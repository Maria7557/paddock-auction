import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { postWalletDepositHandler } from "@/src/modules/wallet/wallet_controller";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  const kycVerified = request.headers.get("x-kyc-verified")?.trim();

  if (kycVerified !== "true") {
    return new Response(
      JSON.stringify({
        error: "KYC_PENDING",
        message: "Your account is under review.",
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-error-code": "KYC_PENDING",
        },
      },
    );
  }

  return postWalletDepositHandler(request);
});
