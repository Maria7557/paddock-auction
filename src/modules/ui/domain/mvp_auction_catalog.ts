export type AuctionStatus = "LIVE" | "PAYMENT_PENDING" | "ENDED";

export type MvpAuctionLot = {
  id: string;
  lotCode: string;
  title: string;
  year: number;
  mileageKm: number;
  fuel: "Petrol" | "Diesel" | "Hybrid" | "Electric";
  drivetrain: "FWD" | "RWD" | "AWD";
  location: string;
  seller: string;
  status: AuctionStatus;
  startsAt: string;
  endsAt: string;
  paymentDeadlineAt: string | null;
  currentBidAed: number;
  minIncrementAed: number;
  bidCount: number;
  depositRequiredAed: number;
  sellerRating: number;
};

export const MVP_AUCTION_CATALOG: MvpAuctionLot[] = [
  {
    id: "8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
    lotCode: "DXB-LIVE-1024",
    title: "Toyota Land Cruiser GXR",
    year: 2022,
    mileageKm: 46210,
    fuel: "Petrol",
    drivetrain: "AWD",
    location: "Dubai Industrial City",
    seller: "Al Noor Fleet Trading",
    status: "LIVE",
    startsAt: "2026-03-01T08:00:00.000Z",
    endsAt: "2026-03-02T08:00:00.000Z",
    paymentDeadlineAt: null,
    currentBidAed: 218000,
    minIncrementAed: 1000,
    bidCount: 27,
    depositRequiredAed: 5000,
    sellerRating: 4.8,
  },
  {
    id: "64e95637-dce9-419a-a08b-2ecf20f8fd20",
    lotCode: "AUH-LIVE-2088",
    title: "BMW X5 M Sport",
    year: 2021,
    mileageKm: 58440,
    fuel: "Hybrid",
    drivetrain: "AWD",
    location: "Abu Dhabi, Mussafah",
    seller: "Gulf Executive Mobility",
    status: "LIVE",
    startsAt: "2026-03-01T10:00:00.000Z",
    endsAt: "2026-03-02T10:00:00.000Z",
    paymentDeadlineAt: null,
    currentBidAed: 171500,
    minIncrementAed: 750,
    bidCount: 18,
    depositRequiredAed: 5000,
    sellerRating: 4.6,
  },
  {
    id: "d57c4a74-f36c-4cf2-a4f3-6d71055895a8",
    lotCode: "SHJ-PAY-3102",
    title: "Mercedes-Benz E300",
    year: 2023,
    mileageKm: 19750,
    fuel: "Petrol",
    drivetrain: "RWD",
    location: "Sharjah Auto Zone",
    seller: "Mosaic Dealer Network",
    status: "PAYMENT_PENDING",
    startsAt: "2026-02-26T09:00:00.000Z",
    endsAt: "2026-02-27T09:00:00.000Z",
    paymentDeadlineAt: "2026-03-01T09:00:00.000Z",
    currentBidAed: 198000,
    minIncrementAed: 1000,
    bidCount: 41,
    depositRequiredAed: 5000,
    sellerRating: 4.7,
  },
  {
    id: "80dce53d-e289-42dc-b966-28600ec89b06",
    lotCode: "DXB-END-4050",
    title: "Audi Q7 S line",
    year: 2020,
    mileageKm: 79500,
    fuel: "Diesel",
    drivetrain: "AWD",
    location: "Dubai Al Quoz",
    seller: "Prime Mobility Holdings",
    status: "ENDED",
    startsAt: "2026-02-24T12:00:00.000Z",
    endsAt: "2026-02-25T12:00:00.000Z",
    paymentDeadlineAt: null,
    currentBidAed: 132000,
    minIncrementAed: 750,
    bidCount: 33,
    depositRequiredAed: 5000,
    sellerRating: 4.5,
  },
];

export function getAuctionById(auctionId: string): MvpAuctionLot | null {
  return MVP_AUCTION_CATALOG.find((auction) => auction.id === auctionId) ?? null;
}

export function formatAed(value: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactDate(value: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function statusLabel(status: AuctionStatus): string {
  if (status === "LIVE") {
    return "Live bidding";
  }

  if (status === "PAYMENT_PENDING") {
    return "Awaiting winner payment";
  }

  return "Closed";
}
