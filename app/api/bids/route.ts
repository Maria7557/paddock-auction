import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { postBidHandler } from "@/src/modules/bidding/transport/post_bid_handler";

function jsonError(status: number, errorCode: string, message?: string): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "x-error-code": errorCode,
  });

  return new Response(
    JSON.stringify({
      error: errorCode,
      ...(message ? { message } : {}),
    }),
    {
      status,
      headers,
    },
  );
}

export const POST = withStructuredMutationLogging(async (request: Request) => {
  const userRole = request.headers.get("x-user-role")?.trim();
  const kycVerified = request.headers.get("x-kyc-verified")?.trim();

  if (userRole !== "BUYER") {
    return jsonError(403, "BUYERS_ONLY");
  }

  if (kycVerified !== "true") {
    return jsonError(
      403,
      "KYC_PENDING",
      "Your account is under review. Usually 1-2 hours.",
    );
  }

  return postBidHandler(request);
});
