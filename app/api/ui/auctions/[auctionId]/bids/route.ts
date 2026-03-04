import { readBidHistory } from "@/src/modules/ui/domain/marketplace_read_model";

export async function GET(
  _request: Request,
  context: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  const params = await context.params;
  const bids = await readBidHistory(params.auctionId);

  return Response.json(
    {
      auction_id: params.auctionId,
      bids: bids.map((bid) => ({
        id: bid.id,
        bidder_alias: bid.bidderAlias,
        amount_aed: bid.amountAed,
        placed_at: bid.placedAt,
        sequence_no: bid.sequenceNo,
        is_mine: bid.isMine ?? false,
      })),
    },
    { status: 200 },
  );
}
