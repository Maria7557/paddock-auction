import SellerAuctionDetailClient from "@/app/seller/auctions/[auctionId]/auction-detail-client";

type PageProps = {
  params: Promise<{ auctionId: string }>;
};

export default async function SellerAuctionDetailPage({ params }: PageProps) {
  const { auctionId } = await params;

  return <SellerAuctionDetailClient auctionId={auctionId} />;
}
