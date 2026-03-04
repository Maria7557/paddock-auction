import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Camera, Clock3 } from "lucide-react";

import {
  type AuctionLot,
  formatAed,
  formatShortDateTime,
} from "@/src/modules/ui/domain/marketplace_read_model";
import { AuctionStatusBadge } from "@/src/modules/ui/transport/components/shared/auction_status_badge";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

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

export function AuctionLotCard({ lot }: AuctionLotCardProps) {
  const heroImage = resolveLotImage(lot.images[0]);
  const buyNowPriceAed = Math.max(lot.currentBidAed + 17000, 235000);

  return (
    <article className="lot-card">
      <div className="lot-image-wrap">
        <Image
          src={heroImage}
          alt={`${lot.make} ${lot.model}`}
          width={920}
          height={620}
          className="lot-image"
          loading="lazy"
        />
        <div className="lot-image-top">
          <AuctionStatusBadge status={lot.status} />
          <span className="lot-number">{lot.lotNumber}</span>
        </div>
        <span className="lot-image-camera" aria-hidden="true">
          <Camera size={18} />
        </span>
      </div>

      <div className="lot-content">
        <h3>{lot.title}</h3>
        <p className="lot-meta-line">
          {lot.year} • {lot.mileageKm.toLocaleString("en-US")} KM • GCC Spec
        </p>

        <div className="lot-price-row">
          <div className="lot-price-col lot-price-current-col">
            <p className="lot-price-label">Current bid</p>
            <p className="lot-price-value">{formatAed(lot.currentBidAed)}</p>
          </div>

          <div className="lot-price-col lot-buy-now-col">
            <p className="lot-price-label">Buy Now</p>
            <p className="lot-buy-now-value">{formatAed(buyNowPriceAed)}</p>
          </div>
        </div>

        <div className="lot-timer-row">
          <div className="lot-time-meta">
            <Clock3 className="structural-icon" size={18} aria-hidden="true" />
            <LiveCountdown targetIso={lot.endsAt} prefix="Ends in" className="lot-countdown" />
          </div>
          <span className="lot-date lot-date-meta">
            <CalendarDays className="structural-icon" size={18} aria-hidden="true" />
            <span>{formatShortDateTime(lot.endsAt)}</span>
          </span>
        </div>

        <Link href={`/auctions/${lot.id}`} className="button button-primary lot-enter">
          Enter Lot
        </Link>
      </div>
    </article>
  );
}
