"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Clock3 } from "lucide-react";

import { Badge, Card, CountdownTimer, PriceDisplay, getBadgeToneFromStatus } from "@/components/ui";

type LotCardProps = {
  lotId: string;
  title: string;
  year: number;
  mileage: number;
  imageUrl: string;
  currentBid: number;
  status: string;
  endTime: string;
};

function resolveImage(imageUrl: string): string {
  if (!imageUrl || imageUrl.includes("picsum.photos")) {
    return "/vehicle-photo.svg";
  }

  return imageUrl;
}

function formatStatusLabel(status: string): string {
  return status.replaceAll("_", " ").toUpperCase();
}

export function LotCard({
  lotId,
  title,
  year,
  mileage,
  imageUrl,
  currentBid,
  status,
  endTime,
}: LotCardProps) {
  const heroImage = resolveImage(imageUrl);

  return (
    <Card as="article" variant="unstyled" className="lot-card">
      <div className="lot-image-wrap">
        <Image
          src={heroImage}
          alt={title}
          width={920}
          height={620}
          className="lot-image"
          loading="lazy"
        />

        <div className="lot-image-top">
          <Badge tone={getBadgeToneFromStatus(status)}>{formatStatusLabel(status)}</Badge>
        </div>

        <span className="lot-image-camera" aria-hidden="true">
          <Camera size={18} />
        </span>
      </div>

      <div className="lot-content">
        <h3>{title}</h3>

        <p className="lot-meta-line">
          {year} • {mileage.toLocaleString("en-US")} KM
        </p>

        <div className="lot-price-row">
          <PriceDisplay amountAed={currentBid} label="Current bid" variant="currentBid" className="lot-price-current-col" />
        </div>

        <div className="lot-timer-row">
          <div className="lot-time-meta">
            <Clock3 className="structural-icon" size={18} aria-hidden="true" />
            <CountdownTimer targetIso={endTime} prefix="Ends in" className="lot-countdown" />
          </div>
        </div>

        <Link href={`/auctions/${lotId}`} className="button button-primary lot-enter">
          Enter Lot
        </Link>
      </div>
    </Card>
  );
}
