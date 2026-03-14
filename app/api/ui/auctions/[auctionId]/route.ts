import { readAuctionDetail } from "@/src/modules/ui/domain/marketplace_read_model";

export async function GET(
  _request: Request,
  context: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  const params = await context.params;
  const lot = await readAuctionDetail(params.auctionId);

  if (!lot) {
    return Response.json(
      {
        error_code: "NOT_FOUND",
        message: "Auction not found",
      },
      { status: 404 },
    );
  }

  return Response.json(
    {
      auction_id: lot.id,
      status: lot.status,
      current_bid_aed: lot.currentBidAed,
      minimum_step_aed: lot.minimumStepAed,
      ends_at: lot.endsAt,
      deposit_ready: lot.depositReady,
    },
    { status: 200 },
  );
}
