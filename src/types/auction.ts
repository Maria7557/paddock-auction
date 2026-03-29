export type LotStatus = 'LIVE' | 'SCHEDULED' | 'CLOSED' | 'CANCELLED';

export interface Lot {
  id: string;
  lotNumber: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  fuelType: string;
  bodyType: string;
  regionSpec: string;
  color: string;
  emirate: string;
  category: string;
  status: LotStatus;
  currentBidAed: number;
  startingBidAed: number;
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

export type MyBidAuctionStatus =
  | "LIVE"
  | "EXTENDED"
  | "SCHEDULED"
  | "AWAITING_SELLER_DECISION"
  | "ENDED"
  | "CLOSED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "DEFAULTED"
  | "CANCELED"
  | "RELISTED";

export interface LiveBidItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  currentHighestBid: number;
  isLeading: boolean;
  auctionEndIso: string;
  auctionStatus: "LIVE" | "EXTENDED";
}

export interface ScheduledBidItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStartIso: string;
  auctionStatus: "SCHEDULED";
  isLeading: boolean;
}

export interface WonPendingItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: "AWAITING_SELLER_DECISION";
  sellerDecisionDeadlineIso: string;
}

export interface WonInvoiceItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: "PAYMENT_PENDING";
  invoiceId: string | null;
  invoiceDueAt: string | null;
}

export interface EndedBidItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  myBidAmount: number;
  auctionStatus: string;
  isLeading: boolean;
}

export interface MyBidsResponse {
  live: LiveBidItem[];
  scheduled: ScheduledBidItem[];
  wonPending: WonPendingItem[];
  wonInvoice: WonInvoiceItem[];
  ended: EndedBidItem[];
}

export interface SellerPendingDecisionItem {
  auctionId: string;
  lotTitle: string;
  imageUrl: string | null;
  winningBidAmount: number;
  buyerAlias: string;
  decisionDeadlineIso: string;
  status: "AWAITING_SELLER_DECISION";
}

export interface SellerPendingDecisionResponse {
  pending: SellerPendingDecisionItem[];
}
