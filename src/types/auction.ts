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

export interface AuctionLiveSnapshot {
  auctionId: string;
  state: string;
  currentPrice: number;
  minIncrement: number;
  startingPrice: number;
  buyNowPrice: number | null;
  startsAt: string | null;
  endsAt: string | null;
  extensionCount: number;
  totalBids: number;
  highestBidId: string | null;
  lastBid: {
    id: string;
    amount: number;
    sequenceNo: number;
    createdAt: string;
  } | null;
}

export type EventLotState =
  | "QUEUED"
  | "ON_BLOCK"
  | "LAST_CHANCE_1"
  | "LAST_CHANCE_2"
  | "SOLD"
  | "UNSOLD"
  | "CLOSED";

export type AuctionEventState = "SCHEDULED" | "LIVE" | "CLOSED";

export interface EventUpcomingLot {
  position: number;
  auctionId: string;
  title: string;
  startingPrice: number;
  currentPrice: number;
  totalBids: number;
}

export interface EventCurrentLot {
  lotId: string;
  auctionId: string;
  position: number;
  callRound: number;
  callEndsAt: string;
  onBlockAt: string;
  snapshot: AuctionLiveSnapshot;
}

export interface EventRuntime {
  eventId: string;
  scheduledAt: string;
  state: AuctionEventState;
  currentLot: EventCurrentLot | null;
  totalLots: number;
  completedLots: number;
  upcomingLots: EventUpcomingLot[];
}
