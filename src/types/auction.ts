export type LotStatus = 'LIVE' | 'SCHEDULED' | 'CLOSED' | 'CANCELLED';

export interface Lot {
  id: string;
  lotNumber: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: string;
  fuelType: string;
  bodyType: string;
  regionSpec: string;
  color: string;
  emirate: string;
  category: string;
  status: LotStatus;
  currentBidAed: number;
  startingBidAed: number;
  marketPriceAed: number | null;
  buyNowPriceAed?: number | null;
  minStepAed: number;
  startsAt: string;
  endsAt: string;
  imageUrl: string;
  totalBids: number;
}

export interface AuctionWeekEvent {
  date: string;
  lotCount: number;
  startingFromAed: number;
  location: string;
  viewingStart?: string | null;
  viewingEnd?: string | null;
  status?: 'LIVE' | 'SCHEDULED';
}

export interface PlatformStats {
  lotsSold: number;
  transactedAed: number;
  verifiedBuyers: number;
  maxDiscountPct: number;
}
