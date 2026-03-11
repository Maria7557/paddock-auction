import Link from "next/link";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";

type VehicleListAuction = {
  id: string;
  state: string;
  currentBidAed: number;
  endsAt: string;
};

type VehicleListCardProps = {
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileageKm: number;
    images: string[];
    latestAuction: VehicleListAuction | null;
  };
};

function maskVin(value: string): string {
  if (value.length <= 6) {
    return value;
  }

  return `${value.slice(0, 8)}…`;
}

export function VehicleListCard({ vehicle }: VehicleListCardProps) {
  const image = vehicle.images[0] ?? "/vehicle-photo.svg";

  return (
    <article className="seller-vehicle-card surface-panel">
      <div className="seller-vehicle-main">
        <img src={image} alt={`${vehicle.brand} ${vehicle.model}`} className="seller-vehicle-thumb" />

        <div className="seller-vehicle-copy">
          <p className="seller-vehicle-title">
            {vehicle.brand} {vehicle.model}
          </p>
          <p className="seller-vehicle-meta">
            {vehicle.year} · {formatAed(vehicle.latestAuction?.currentBidAed ?? 0)}
          </p>
          <p className="seller-vehicle-vin">VIN: {maskVin(vehicle.vin)}</p>
        </div>
      </div>

      <div className="seller-vehicle-side">
        {vehicle.latestAuction ? <AuctionStatusBadge state={vehicle.latestAuction.state} /> : <span className="seller-status seller-status-draft">NO AUCTION</span>}

        {vehicle.latestAuction ? (
          <p className="seller-vehicle-end">Ends: {formatSellerDateTime(vehicle.latestAuction.endsAt)}</p>
        ) : (
          <p className="seller-vehicle-end">Create an auction draft</p>
        )}

        {vehicle.latestAuction ? (
          <Link href={`/seller/auctions/${vehicle.latestAuction.id}`} className="seller-inline-link">
            View Auction →
          </Link>
        ) : (
          <Link href={`/seller/vehicles/${vehicle.id}`} className="seller-inline-link">
            View Vehicle →
          </Link>
        )}
      </div>
    </article>
  );
}
