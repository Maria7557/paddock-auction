import { LotCard } from "@/components/auction/LotCard";

import { type AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionLotCardProps = {
  lot: AuctionLot;
};

function resolveLotImage(image: string | undefined): string {
  if (!image) {
    return "/vehicle-photo.svg";
  }

  if (image.includes("picsum.photos")) {
    return "/vehicle-photo.svg";
  }

  return image;
}

function estimateMarketPrice(currentBidAed: number): number {
  return Math.max(Math.round(currentBidAed * 1.2), currentBidAed);
}

export function AuctionLotCard({ lot }: AuctionLotCardProps) {
  const heroImage = resolveLotImage(lot.images[0]);
  const marketPrice = lot.marketPriceAed ?? estimateMarketPrice(lot.currentBidAed);
  const regionSpec = lot.specs.find((spec) => spec.label.toLowerCase() === "region")?.value;

  return (
    <LotCard
      lotId={lot.id}
      title={lot.title}
      year={lot.year}
      mileage={lot.mileageKm}
      regionSpec={regionSpec}
      imageUrl={heroImage}
      currentBid={lot.currentBidAed}
      status={lot.status}
      endTime={lot.endsAt}
      marketPrice={marketPrice}
    />
  );
}
