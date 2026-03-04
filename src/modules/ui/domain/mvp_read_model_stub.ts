// Temporary UI read-model stubs.
// Replace these functions with real GET endpoints once the backend read APIs are available.

export type AuctionStatus =
  | "LIVE"
  | "SCHEDULED"
  | "ENDED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "DEFAULTED";

export type AuctionReadModel = {
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
  closedAt: string | null;
  currentBidAed: number;
  minIncrementAed: number;
  bidCount: number;
  depositRequiredAed: number;
  sellerRating: number;
  sellerVerifiedYears: number;
  conditionSummary: string;
};

export type BidLadderEntryReadModel = {
  id: string;
  auctionId: string;
  sequenceNo: number;
  amountAed: number;
  companyAlias: string;
  placedAt: string;
};

export type FinanceInvoiceReadModel = {
  invoiceId: string;
  auctionId: string;
  lotCode: string;
  lotTitle: string;
  buyerCompanyId: string;
  totalAed: number;
  issuedAt: string;
  dueAt: string;
  closedAt: string;
  invoiceStatus: "ISSUED" | "PAID" | "DEFAULTED";
  deadlineStatus: "OPEN" | "PAID" | "DEFAULTED";
  winnerDepositAed: number;
};

export type AuctionBoardFilters = {
  query: string;
  status: "ALL" | AuctionStatus;
  location: "ALL" | string;
  seller: "ALL" | string;
  minPriceAed: number | null;
  maxPriceAed: number | null;
};

const AUCTION_READ_MODELS: AuctionReadModel[] = [
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
    closedAt: null,
    currentBidAed: 218000,
    minIncrementAed: 1000,
    bidCount: 27,
    depositRequiredAed: 5000,
    sellerRating: 4.8,
    sellerVerifiedYears: 6,
    conditionSummary: "Dealer-serviced, no structural damage, full GCC history.",
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
    closedAt: null,
    currentBidAed: 171500,
    minIncrementAed: 750,
    bidCount: 18,
    depositRequiredAed: 5000,
    sellerRating: 4.6,
    sellerVerifiedYears: 4,
    conditionSummary: "Minor cosmetic marks, premium interior, documented maintenance.",
  },
  {
    id: "3125f011-3f34-4068-b0d7-b7000484baab",
    lotCode: "DXB-LIVE-5112",
    title: "Tesla Model Y Long Range",
    year: 2023,
    mileageKm: 22500,
    fuel: "Electric",
    drivetrain: "AWD",
    location: "Dubai, Jebel Ali",
    seller: "Atlas Fleet Hub",
    status: "LIVE",
    startsAt: "2026-03-01T09:30:00.000Z",
    endsAt: "2026-03-02T09:30:00.000Z",
    closedAt: null,
    currentBidAed: 183000,
    minIncrementAed: 500,
    bidCount: 32,
    depositRequiredAed: 5000,
    sellerRating: 4.9,
    sellerVerifiedYears: 7,
    conditionSummary: "Battery health report attached, single fleet owner.",
  },
  {
    id: "72bb6180-ed27-4f0d-84eb-e6e558f127ba",
    lotCode: "RAK-SCH-7601",
    title: "Nissan Patrol LE Platinum",
    year: 2022,
    mileageKm: 38900,
    fuel: "Petrol",
    drivetrain: "AWD",
    location: "Ras Al Khaimah",
    seller: "Desert Gate Auto",
    status: "SCHEDULED",
    startsAt: "2026-03-03T08:00:00.000Z",
    endsAt: "2026-03-04T08:00:00.000Z",
    closedAt: null,
    currentBidAed: 0,
    minIncrementAed: 1000,
    bidCount: 0,
    depositRequiredAed: 5000,
    sellerRating: 4.4,
    sellerVerifiedYears: 3,
    conditionSummary: "Scheduled lot, final inspection approval completed.",
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
    closedAt: "2026-02-27T09:01:00.000Z",
    currentBidAed: 198000,
    minIncrementAed: 1000,
    bidCount: 41,
    depositRequiredAed: 5000,
    sellerRating: 4.7,
    sellerVerifiedYears: 5,
    conditionSummary: "Winning invoice issued, payment window active.",
  },
  {
    id: "a2a8d6e6-fab9-486b-bfa3-bbf88ba44b2f",
    lotCode: "AUH-PAY-3180",
    title: "Lexus LX600 Prestige",
    year: 2024,
    mileageKm: 12600,
    fuel: "Petrol",
    drivetrain: "AWD",
    location: "Abu Dhabi Industrial Area",
    seller: "Pearl Motors Contracting",
    status: "PAYMENT_PENDING",
    startsAt: "2026-02-27T12:00:00.000Z",
    endsAt: "2026-02-28T12:00:00.000Z",
    closedAt: "2026-02-28T12:03:00.000Z",
    currentBidAed: 355000,
    minIncrementAed: 1500,
    bidCount: 22,
    depositRequiredAed: 5000,
    sellerRating: 4.8,
    sellerVerifiedYears: 9,
    conditionSummary: "Premium trim, verified ownership and warranty documents.",
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
    closedAt: "2026-02-25T12:05:00.000Z",
    currentBidAed: 132000,
    minIncrementAed: 750,
    bidCount: 33,
    depositRequiredAed: 5000,
    sellerRating: 4.5,
    sellerVerifiedYears: 5,
    conditionSummary: "Auction closed; pending post-auction review.",
  },
  {
    id: "0c2979bc-401e-43b0-acf1-c214f8474e9b",
    lotCode: "FUJ-DEF-4222",
    title: "Range Rover Sport HSE",
    year: 2021,
    mileageKm: 51240,
    fuel: "Hybrid",
    drivetrain: "AWD",
    location: "Fujairah Logistics Zone",
    seller: "Northern Premier Autos",
    status: "DEFAULTED",
    startsAt: "2026-02-22T11:00:00.000Z",
    endsAt: "2026-02-23T11:00:00.000Z",
    closedAt: "2026-02-23T11:01:00.000Z",
    currentBidAed: 161000,
    minIncrementAed: 1000,
    bidCount: 15,
    depositRequiredAed: 5000,
    sellerRating: 4.2,
    sellerVerifiedYears: 2,
    conditionSummary: "Winner defaulted, collateral burned per policy.",
  },
];

const BID_LADDER_BY_AUCTION_ID: Record<string, BidLadderEntryReadModel[]> = {
  "8d807f7f-f6f7-4b26-b332-7c7266cf57e0": [
    {
      id: "b-1006",
      auctionId: "8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      sequenceNo: 27,
      amountAed: 218000,
      companyAlias: "ALN-FLEET",
      placedAt: "2026-03-01T14:54:21.000Z",
    },
    {
      id: "b-1005",
      auctionId: "8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      sequenceNo: 26,
      amountAed: 217000,
      companyAlias: "ZEN-LEASE",
      placedAt: "2026-03-01T14:53:08.000Z",
    },
    {
      id: "b-1004",
      auctionId: "8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      sequenceNo: 25,
      amountAed: 216000,
      companyAlias: "MOTIVE-TRD",
      placedAt: "2026-03-01T14:52:01.000Z",
    },
  ],
  "64e95637-dce9-419a-a08b-2ecf20f8fd20": [
    {
      id: "b-2044",
      auctionId: "64e95637-dce9-419a-a08b-2ecf20f8fd20",
      sequenceNo: 18,
      amountAed: 171500,
      companyAlias: "GULF-AUTO",
      placedAt: "2026-03-01T14:48:31.000Z",
    },
    {
      id: "b-2043",
      auctionId: "64e95637-dce9-419a-a08b-2ecf20f8fd20",
      sequenceNo: 17,
      amountAed: 170750,
      companyAlias: "KITE-CARS",
      placedAt: "2026-03-01T14:47:02.000Z",
    },
  ],
  "3125f011-3f34-4068-b0d7-b7000484baab": [
    {
      id: "b-3090",
      auctionId: "3125f011-3f34-4068-b0d7-b7000484baab",
      sequenceNo: 32,
      amountAed: 183000,
      companyAlias: "ATLAS-RAC",
      placedAt: "2026-03-01T14:56:01.000Z",
    },
    {
      id: "b-3089",
      auctionId: "3125f011-3f34-4068-b0d7-b7000484baab",
      sequenceNo: 31,
      amountAed: 182500,
      companyAlias: "FASTMILES",
      placedAt: "2026-03-01T14:55:06.000Z",
    },
  ],
};

const FINANCE_INVOICE_READ_MODELS: FinanceInvoiceReadModel[] = [
  {
    invoiceId: "inv-d57c4a74-f36c",
    auctionId: "d57c4a74-f36c-4cf2-a4f3-6d71055895a8",
    lotCode: "SHJ-PAY-3102",
    lotTitle: "Mercedes-Benz E300",
    buyerCompanyId: "buyer-company-shj-01",
    totalAed: 198000,
    issuedAt: "2026-02-27T09:04:00.000Z",
    dueAt: "2026-03-01T09:01:00.000Z",
    closedAt: "2026-02-27T09:01:00.000Z",
    invoiceStatus: "ISSUED",
    deadlineStatus: "OPEN",
    winnerDepositAed: 5000,
  },
  {
    invoiceId: "inv-a2a8d6e6-fab9",
    auctionId: "a2a8d6e6-fab9-486b-bfa3-bbf88ba44b2f",
    lotCode: "AUH-PAY-3180",
    lotTitle: "Lexus LX600 Prestige",
    buyerCompanyId: "buyer-company-auh-02",
    totalAed: 355000,
    issuedAt: "2026-02-28T12:06:00.000Z",
    dueAt: "2026-03-02T12:03:00.000Z",
    closedAt: "2026-02-28T12:03:00.000Z",
    invoiceStatus: "ISSUED",
    deadlineStatus: "OPEN",
    winnerDepositAed: 5000,
  },
  {
    invoiceId: "inv-paid-82313",
    auctionId: "80dce53d-e289-42dc-b966-28600ec89b06",
    lotCode: "DXB-END-4050",
    lotTitle: "Audi Q7 S line",
    buyerCompanyId: "buyer-company-dxb-11",
    totalAed: 132000,
    issuedAt: "2026-02-25T12:07:00.000Z",
    dueAt: "2026-02-27T12:05:00.000Z",
    closedAt: "2026-02-25T12:05:00.000Z",
    invoiceStatus: "PAID",
    deadlineStatus: "PAID",
    winnerDepositAed: 5000,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function formatAed(value: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function formatLongDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function getAuctionStatusLabel(status: AuctionStatus): string {
  switch (status) {
    case "LIVE":
      return "Live";
    case "SCHEDULED":
      return "Scheduled";
    case "PAYMENT_PENDING":
      return "Payment pending";
    case "PAID":
      return "Paid";
    case "DEFAULTED":
      return "Defaulted";
    case "ENDED":
    default:
      return "Ended";
  }
}

export type DeadlineUrgency = "normal" | "warning" | "critical" | "resolved";

export function getDeadlineUrgency(
  dueAt: string,
  deadlineStatus: FinanceInvoiceReadModel["deadlineStatus"],
  now = new Date(),
): DeadlineUrgency {
  if (deadlineStatus !== "OPEN") {
    return "resolved";
  }

  const dueAtMs = new Date(dueAt).getTime();
  const diffHours = (dueAtMs - now.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 12) {
    return "critical";
  }

  if (diffHours <= 24) {
    return "warning";
  }

  return "normal";
}

export function describeDeadlineWindow(
  dueAt: string,
  deadlineStatus: FinanceInvoiceReadModel["deadlineStatus"],
  now = new Date(),
): string {
  if (deadlineStatus === "PAID") {
    return "Paid within policy window";
  }

  if (deadlineStatus === "DEFAULTED") {
    return "Defaulted and lock burned";
  }

  const dueAtMs = new Date(dueAt).getTime();
  const diffMs = dueAtMs - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours <= 0) {
    return "Deadline exceeded; default and burn risk active";
  }

  return `${diffHours}h remaining to pay before default/burn`;
}

export function filterAuctions(
  auctions: AuctionReadModel[],
  filters: AuctionBoardFilters,
): AuctionReadModel[] {
  const query = filters.query.trim().toLowerCase();

  return auctions.filter((auction) => {
    if (filters.status !== "ALL" && auction.status !== filters.status) {
      return false;
    }

    if (filters.location !== "ALL" && auction.location !== filters.location) {
      return false;
    }

    if (filters.seller !== "ALL" && auction.seller !== filters.seller) {
      return false;
    }

    if (filters.minPriceAed !== null && auction.currentBidAed < filters.minPriceAed) {
      return false;
    }

    if (filters.maxPriceAed !== null && auction.currentBidAed > filters.maxPriceAed) {
      return false;
    }

    if (query.length > 0) {
      const searchHaystack = `${auction.title} ${auction.lotCode} ${auction.seller} ${auction.location}`
        .toLowerCase();

      if (!searchHaystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

export function getAuctionById(auctionId: string): AuctionReadModel | null {
  return AUCTION_READ_MODELS.find((auction) => auction.id === auctionId) ?? null;
}

export async function readAuctionBoardStub(): Promise<AuctionReadModel[]> {
  await sleep(160);
  return AUCTION_READ_MODELS.map((auction) => ({ ...auction }));
}

export async function readBidLadderStub(auctionId: string): Promise<BidLadderEntryReadModel[]> {
  await sleep(120);
  return (BID_LADDER_BY_AUCTION_ID[auctionId] ?? []).map((entry) => ({ ...entry }));
}

export async function readFinanceInvoicesStub(): Promise<FinanceInvoiceReadModel[]> {
  await sleep(180);
  return FINANCE_INVOICE_READ_MODELS.map((invoice) => ({ ...invoice }));
}
