import { notFound } from "next/navigation";

import { AuctionLiveRoom } from "@/src/components/auction/AuctionLiveRoom";
import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";
import type { AuctionLiveSnapshot } from "@/src/types/auction";
import { getLot } from "@/app/auctions/[auctionId]/lot-data";

type PageProps = {
  params: Promise<{
    auctionId: string;
  }>;
};

export default async function LiveAuctionPage({ params }: PageProps) {
  const { auctionId } = await params;
  const requestOptions = await withServerCookies({
    cache: "no-store",
  });

  const [lot, initialSnapshot] = await Promise.all([
    getLot(auctionId),
    api.auctions.getLiveSnapshot(auctionId, requestOptions).catch(() => null as AuctionLiveSnapshot | null),
  ]);

  if (!lot || !initialSnapshot) {
    notFound();
  }

  return <AuctionLiveRoom auctionId={auctionId} initialSnapshot={initialSnapshot} lot={lot} />;
}
