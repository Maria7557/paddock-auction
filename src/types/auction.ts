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
  marketPriceAed: number;
  minStepAed: number;
  startsAt: string;
  endsAt: string;
  imageUrl: string;
  totalBids: number;
}

export interface AuctionWeekEvent {
  date: string;
  lotCount: number;
  location: string;
  viewingStart: string;
  viewingEnd: string;
}

export interface PlatformStats {
  lotsSold: number;
  transactedAed: number;
  verifiedBuyers: number;
  maxDiscountPct: number;
}
