// Temporary frontend read model for marketplace UX.
// Replace with backend GET read endpoints when those contracts are available.

import type {
  AuctionState,
  Auction as DbAuction,
  Company as DbCompany,
  InvoiceStatus as DbInvoiceStatus,
  LedgerType,
  Prisma,
} from "@prisma/client";

import prisma from "@/src/infrastructure/database/prisma";
import type { SupportedLocale } from "@/src/i18n/routing";

export type AuctionStatus =
  | "LIVE"
  | "SCHEDULED"
  | "PAYMENT_PENDING"
  | "DEFAULTED"
  | "ENDED";

export type AuctionSpec = {
  label: string;
  value: string;
};

export type AuctionDocument = {
  id: string;
  label: string;
  fileType: "PDF" | "JPG" | "ZIP";
};

export type AuctionBidHistoryEntry = {
  id: string;
  auctionId: string;
  bidderAlias: string;
  amountAed: number;
  placedAt: string;
  sequenceNo: number;
  isMine?: boolean;
};

export type AuctionLot = {
  id: string;
  lotNumber: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  location: string;
  seller: string;
  sellerVerifiedYears: number;
  sellerCompletionRate: number;
  vin: string;
  status: AuctionStatus;
  currentBidAed: number;
  marketPriceAed?: number | null;
  buyNowPriceAed?: number | null;
  minimumStepAed: number;
  endsAt: string;
  startsAt: string;
  listedAt: string;
  depositRequiredAed: number;
  depositReady: boolean;
  watchlisted: boolean;
  images: string[];
  vehicle?: {
    description: string | null;
    engine: string | null;
    driveType: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    airbags: string;
    damage: string;
    images: string[];
  };
  specs: AuctionSpec[];
  inspectionSummary: string;
  sellerNotes: string;
  documents: AuctionDocument[];
};

export type WalletLockReadModel = {
  lockId: string;
  auctionId: string | null;
  lotNumber: string;
  amountAed: number;
  status: "ACTIVE" | "RELEASED" | "BURNED";
};

export type WalletTransactionReadModel = {
  id: string;
  type: "TOP_UP" | "LOCK_ACQUIRE" | "LOCK_RELEASE" | "LOCK_BURN" | "WITHDRAWAL";
  amountAed: number;
  createdAt: string;
  note: string;
};

export type WalletReadModel = {
  availableBalanceAed: number;
  lockedBalanceAed: number;
  pendingWithdrawalAed: number;
  activeLocks: WalletLockReadModel[];
  transactions: WalletTransactionReadModel[];
};

export type InvoiceStatus = "ISSUED" | "PAID_PENDING_CONFIRMATION" | "PAID" | "DEFAULTED" | "CANCELED";

export type InvoiceReadModel = {
  id: string;
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  winnerCompany: string;
  winningAmountAed: number;
  commissionAed: number;
  vatAed: number;
  totalAed: number;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  stripePaymentIntentId: string | null;
};

const READ_MODEL_VEHICLE_SELECT = {
  id: true,
  brand: true,
  model: true,
  year: true,
  mileage: true,
  vin: true,
  fuelType: true,
  transmission: true,
  bodyType: true,
  regionSpec: true,
  serviceHistory: true,
  description: true,
  engine: true,
  driveType: true,
  exteriorColor: true,
  interiorColor: true,
  airbags: true,
  damage: true,
  damageMap: true,
  images: true,
} satisfies Prisma.VehicleSelect;

type ReadModelVehicle = Prisma.VehicleGetPayload<{
  select: typeof READ_MODEL_VEHICLE_SELECT;
}>;

export type MyBidReadModel = {
  id: string;
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  myBidAed: number;
  highestBidAed: number;
  endsAt: string;
  isWinning: boolean;
  status: AuctionStatus;
};

export type DashboardReadModel = {
  activeBids: number;
  watching: number;
  invoicesDue: number;
  depositBalanceAed: number;
  recentActivity: {
    id: string;
    title: string;
    detail: string;
    createdAt: string;
  }[];
};

export type BuyerReadQueryInput = {
  userId: string;
  companyId: string | null;
};

export type DashboardQueryInput = BuyerReadQueryInput;

export type AuctionFilterState = {
  query: string;
  status: "ALL" | AuctionStatus;
  location: "ALL" | string;
  seller: "ALL" | string;
  minPriceAed: number | null;
  maxPriceAed: number | null;
  minYear: number | null;
  maxMileageKm: number | null;
  endingSoonOnly: boolean;
  sortBy: "ENDING_SOON" | "LOWEST_PRICE" | "HIGHEST_BIDS" | "RECENTLY_ADDED";
};

const BID_HISTORY_BY_AUCTION_ID: Record<string, AuctionBidHistoryEntry[]> = {
  "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0": [
    {
      id: "bid-9082",
      auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      bidderAlias: "ALN-FLEET",
      amountAed: 218000,
      placedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      sequenceNo: 27,
      isMine: true,
    },
    {
      id: "bid-9081",
      auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      bidderAlias: "ZEN-LEASE",
      amountAed: 217000,
      placedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      sequenceNo: 26,
    },
    {
      id: "bid-9080",
      auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
      bidderAlias: "MOTIVE-TRD",
      amountAed: 216000,
      placedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
      sequenceNo: 25,
    },
  ],
  "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20": [
    {
      id: "bid-7502",
      auctionId: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
      bidderAlias: "GULF-AUTO",
      amountAed: 171500,
      placedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      sequenceNo: 18,
    },
    {
      id: "bid-7501",
      auctionId: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
      bidderAlias: "KITE-CARS",
      amountAed: 170750,
      placedAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
      sequenceNo: 17,
      isMine: true,
    },
  ],
  "lot-3125f011-3f34-4068-b0d7-b7000484baab": [
    {
      id: "bid-2202",
      auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
      bidderAlias: "ATLAS-RAC",
      amountAed: 183000,
      placedAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      sequenceNo: 32,
    },
    {
      id: "bid-2201",
      auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
      bidderAlias: "FASTMILES",
      amountAed: 182500,
      placedAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      sequenceNo: 31,
      isMine: true,
    },
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const HOMEPAGE_AUCTION_STATES: AuctionState[] = ["LIVE", "SCHEDULED"];
const LISTING_AUCTION_STATES: AuctionState[] = [
  "LIVE",
  "SCHEDULED",
  "PAYMENT_PENDING",
  "DEFAULTED",
  "ENDED",
  "CLOSED",
  "EXTENDED",
];
const FALLBACK_LOT_IMAGES = [
  "/images/car-elantra.jpg",
  "/images/car-gwagon.jpg",
  "/images/car-bentley.jpg",
  "/images/car-mclaren.jpg",
  "/images/car-mustang.jpg",
];

function normalizeAuctionStatus(state: AuctionState): AuctionStatus {
  if (state === "LIVE") {
    return "LIVE";
  }

  if (state === "SCHEDULED") {
    return "SCHEDULED";
  }

  if (state === "PAYMENT_PENDING") {
    return "PAYMENT_PENDING";
  }

  if (state === "DEFAULTED") {
    return "DEFAULTED";
  }

  return "ENDED";
}

function deriveLotNumber(auctionId: string): string {
  return `LOT-${auctionId.slice(0, 8).toUpperCase()}`;
}

function buildLotTitle(
  brand: string | null | undefined,
  model: string | null | undefined,
  auctionId: string,
): string {
  const trimmedBrand = brand?.trim() ?? "";
  const trimmedModel = model?.trim() ?? "";

  if (trimmedBrand || trimmedModel) {
    return `${trimmedBrand} ${trimmedModel}`.trim();
  }

  return deriveLotNumber(auctionId);
}

function normalizeInvoiceStatus(status: DbInvoiceStatus): InvoiceStatus {
  if (status === "PAID_PENDING_CONFIRMATION") {
    return "PAID";
  }

  if (status === "CANCELED") {
    return "CANCELED";
  }

  return status;
}

function mapLedgerTypeToWalletType(type: LedgerType): WalletTransactionReadModel["type"] {
  if (type === "DEPOSIT_LOCK") {
    return "LOCK_ACQUIRE";
  }

  if (type === "DEPOSIT_RELEASE") {
    return "LOCK_RELEASE";
  }

  if (type === "DEPOSIT_BURN") {
    return "LOCK_BURN";
  }

  if (type === "WITHDRAWAL" || type === "WITHDRAWAL_REQUESTED" || type === "WITHDRAWAL_APPROVED") {
    return "WITHDRAWAL";
  }

  return "TOP_UP";
}

function buildWalletTransactionNote(type: LedgerType, reference: string | null): string {
  if (reference && reference.trim().length > 0) {
    return reference;
  }

  if (type === "DEPOSIT_TOPUP") {
    return "Wallet top-up";
  }

  if (type === "DEPOSIT_LOCK") {
    return "Deposit lock acquired";
  }

  if (type === "DEPOSIT_RELEASE") {
    return "Deposit lock released";
  }

  if (type === "DEPOSIT_BURN") {
    return "Deposit lock burned";
  }

  if (type === "ADMIN_REFUND") {
    return "Admin refund";
  }

  if (type === "PAYMENT_RECEIVED") {
    return "Payment received";
  }

  if (type === "WITHDRAWAL_REQUESTED") {
    return "Withdrawal requested";
  }

  if (type === "WITHDRAWAL_APPROVED") {
    return "Withdrawal approved";
  }

  return "Withdrawal";
}

function deriveLotImages(vehicle: ReadModelVehicle | null, index: number): string[] {
  if (vehicle?.images && vehicle.images.length > 0) {
    return vehicle.images;
  }

  const brand = vehicle?.brand.trim().toLowerCase() ?? "";

  if (brand.includes("bentley")) {
    return ["/images/car-bentley.jpg"];
  }

  if (brand.includes("mercedes") || brand.includes("nissan") || brand.includes("gmc")) {
    return ["/images/car-gwagon.jpg"];
  }

  if (brand.includes("mustang") || brand.includes("ford")) {
    return ["/images/car-mustang.jpg"];
  }

  if (brand.includes("mclaren") || brand.includes("ferrari") || brand.includes("lamborghini")) {
    return ["/images/car-mclaren.jpg"];
  }

  return [FALLBACK_LOT_IMAGES[index % FALLBACK_LOT_IMAGES.length] ?? "/vehicle-photo.svg"];
}

function buildSpecs(vehicle: ReadModelVehicle | null): AuctionSpec[] {
  if (!vehicle) {
    return [];
  }

  return [
    vehicle.fuelType ? { label: "Fuel", value: vehicle.fuelType } : null,
    vehicle.transmission ? { label: "Transmission", value: vehicle.transmission } : null,
    vehicle.bodyType ? { label: "Body Type", value: vehicle.bodyType } : null,
    vehicle.regionSpec ? { label: "Region", value: vehicle.regionSpec } : null,
    vehicle.serviceHistory ? { label: "Service", value: vehicle.serviceHistory } : null,
  ].filter((spec): spec is AuctionSpec => spec !== null);
}

function toAuctionLot({
  auction,
  vehicle,
  company,
  index,
}: {
  auction: DbAuction;
  vehicle: ReadModelVehicle | null;
  company: DbCompany | null;
  index: number;
}): AuctionLot {
  const title = `${vehicle?.brand ?? "Vehicle"} ${vehicle?.model ?? auction.id.slice(0, 6)}`.trim();
  const status = normalizeAuctionStatus(auction.state);
  const currentBidAed = Number(auction.currentPrice.toString());
  const minimumStepAed = Number(auction.minIncrement.toString());
  const sellerVerifiedYears = company
    ? Math.max(1, new Date().getUTCFullYear() - company.createdAt.getUTCFullYear())
    : 1;

  return {
    id: auction.id,
    lotNumber: deriveLotNumber(auction.id),
    title,
    make: vehicle?.brand ?? "Unknown",
    model: vehicle?.model ?? "Unknown",
    year: vehicle?.year ?? new Date().getUTCFullYear(),
    mileageKm: vehicle?.mileage ?? 0,
    location: company?.country ?? "UAE",
    seller: company?.name ?? "Verified Seller",
    sellerVerifiedYears,
    sellerCompletionRate: 96,
    vin: vehicle?.vin ?? "PENDING",
    status,
    currentBidAed,
    marketPriceAed: null,
    buyNowPriceAed: auction.buyNowPrice === null ? null : Number(auction.buyNowPrice.toString()),
    minimumStepAed,
    endsAt: auction.endsAt.toISOString(),
    startsAt: auction.startsAt.toISOString(),
    listedAt: auction.createdAt.toISOString(),
    depositRequiredAed: 5000,
    // TODO: dead code until the public lot detail flow is wired to real buyer deposit status.
    depositReady: true,
    watchlisted: false,
    images: deriveLotImages(vehicle, index),
    vehicle: {
      description: vehicle?.description ?? null,
      engine: vehicle?.engine ?? null,
      driveType: vehicle?.driveType ?? null,
      exteriorColor: vehicle?.exteriorColor ?? null,
      interiorColor: vehicle?.interiorColor ?? null,
      airbags: vehicle?.airbags ?? "Intact",
      damage: vehicle?.damage ?? "None",
      images: vehicle?.images ?? [],
    },
    specs: buildSpecs(vehicle),
    inspectionSummary:
      status === "DEFAULTED"
        ? "Winner defaulted under payment policy. Lot awaiting relist."
        : "Operational fleet vehicle with verified ownership and service records.",
    sellerNotes: vehicle?.description ?? "Vehicle sourced from verified UAE fleet operator.",
    documents: [{ id: `doc-${auction.id}`, label: "Inspection report", fileType: "PDF" }],
  };
}

async function hydrateAuctionLots(auctions: DbAuction[]): Promise<AuctionLot[]> {
  if (auctions.length === 0) {
    return [];
  }

  const vehicleIds = [...new Set(auctions.map((auction) => auction.vehicleId))];
  const companyIds = [...new Set(auctions.map((auction) => auction.sellerCompanyId))];

  const [vehicles, companies] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        id: {
          in: vehicleIds,
        },
      },
      select: READ_MODEL_VEHICLE_SELECT,
    }),
    prisma.company.findMany({
      where: {
        id: {
          in: companyIds,
        },
      },
    }),
  ]);

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const companyById = new Map(companies.map((company) => [company.id, company]));

  return auctions.map((auction, index) =>
    toAuctionLot({
      auction,
      vehicle: vehicleById.get(auction.vehicleId) ?? null,
      company: companyById.get(auction.sellerCompanyId) ?? null,
      index,
    }),
  );
}

export async function readHomepageLots(): Promise<AuctionLot[]> {
  const auctions = await prisma.auction.findMany({
    where: {
      state: {
        in: HOMEPAGE_AUCTION_STATES,
      },
    },
    orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }],
    take: 6,
  });

  const lots = await hydrateAuctionLots(auctions);
  const statusRank: Record<AuctionStatus, number> = {
    LIVE: 0,
    SCHEDULED: 1,
    PAYMENT_PENDING: 2,
    DEFAULTED: 3,
    ENDED: 4,
  };

  return lots.sort((left, right) => {
    const rankDelta = statusRank[left.status] - statusRank[right.status];

    if (rankDelta !== 0) {
      return rankDelta;
    }

    return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
  });
}

export async function readAuctionListing(): Promise<AuctionLot[]> {
  const auctions = await prisma.auction.findMany({
    where: {
      state: {
        in: LISTING_AUCTION_STATES,
      },
    },
    orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }],
  });

  return hydrateAuctionLots(auctions);
}

export async function readAuctionDetail(auctionId: string): Promise<AuctionLot | null> {
  const auction = await prisma.auction.findUnique({
    where: {
      id: auctionId,
    },
  });

  if (!auction) {
    return null;
  }

  const [vehicle, company] = await Promise.all([
    prisma.vehicle.findUnique({
      where: {
        id: auction.vehicleId,
      },
    }),
    prisma.company.findUnique({
      where: {
        id: auction.sellerCompanyId,
      },
    }),
  ]);

  return toAuctionLot({
    auction,
    vehicle,
    company,
    index: 0,
  });
}

export async function readBidHistory(auctionId: string): Promise<AuctionBidHistoryEntry[]> {
  await sleep(65);

  return (BID_HISTORY_BY_AUCTION_ID[auctionId] ?? [])
    .slice()
    .sort((left, right) => right.sequenceNo - left.sequenceNo)
    .map((entry) => ({ ...entry }));
}

export async function readWallet(input: Pick<BuyerReadQueryInput, "userId">): Promise<WalletReadModel> {
  await sleep(40);

  const wallet = await prisma.wallet.findUnique({
    where: {
      userId: input.userId,
    },
    select: {
      id: true,
      balance: true,
      lockedBalance: true,
    },
  });

  if (!wallet) {
    return {
      availableBalanceAed: 0,
      lockedBalanceAed: 0,
      pendingWithdrawalAed: 0,
      activeLocks: [],
      transactions: [],
    };
  }

  const [activeLocks, transactions] = await Promise.all([
    prisma.depositLock.findMany({
      where: {
        walletId: wallet.id,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 25,
      select: {
        id: true,
        auctionId: true,
        amount: true,
        status: true,
      },
    }),
    prisma.walletLedger.findMany({
      where: {
        walletId: wallet.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        reference: true,
      },
    }),
  ]);

  return {
    availableBalanceAed: Number(wallet.balance.toString()),
    lockedBalanceAed: Number(wallet.lockedBalance.toString()),
    pendingWithdrawalAed: 0,
    activeLocks: activeLocks.map((lock) => ({
      lockId: lock.id,
      auctionId: lock.auctionId,
      lotNumber: lock.auctionId ? deriveLotNumber(lock.auctionId) : "GLOBAL",
      amountAed: Number(lock.amount.toString()),
      status: lock.status,
    })),
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: mapLedgerTypeToWalletType(tx.type),
      amountAed: Number(tx.amount.toString()),
      createdAt: tx.createdAt.toISOString(),
      note: buildWalletTransactionNote(tx.type, tx.reference),
    })),
  };
}

export async function readInvoices(input: Pick<BuyerReadQueryInput, "companyId">): Promise<InvoiceReadModel[]> {
  await sleep(40);

  if (!input.companyId) {
    return [];
  }

  const [invoices, buyerCompany] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        buyerCompanyId: input.companyId,
      },
      orderBy: [{ dueAt: "asc" }, { issuedAt: "desc" }],
      select: {
        id: true,
        auctionId: true,
        buyerCompanyId: true,
        subtotal: true,
        commission: true,
        vat: true,
        total: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        auction: {
          select: {
            id: true,
            vehicle: {
              select: {
                brand: true,
                model: true,
              },
            },
          },
        },
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            stripePaymentIntentId: true,
          },
        },
      },
    }),
    prisma.company.findUnique({
      where: {
        id: input.companyId,
      },
      select: {
        name: true,
      },
    }),
  ]);

  const winnerCompany = buyerCompany?.name ?? "Buyer company";

  return invoices.map((invoice) => ({
    id: invoice.id,
    auctionId: invoice.auctionId,
    lotNumber: deriveLotNumber(invoice.auctionId),
    lotTitle: buildLotTitle(invoice.auction.vehicle?.brand, invoice.auction.vehicle?.model, invoice.auction.id),
    winnerCompany,
    winningAmountAed: Number(invoice.subtotal.toString()),
    commissionAed: Number(invoice.commission.toString()),
    vatAed: Number(invoice.vat.toString()),
    totalAed: Number(invoice.total.toString()),
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt.toISOString(),
    status: normalizeInvoiceStatus(invoice.status),
    stripePaymentIntentId: invoice.payments[0]?.stripePaymentIntentId ?? null,
  }));
}

export async function readInvoiceDetail(
  invoiceId: string,
  input: Pick<BuyerReadQueryInput, "companyId">,
): Promise<InvoiceReadModel | null> {
  await sleep(40);

  if (!input.companyId) {
    return null;
  }

  const [invoice, buyerCompany] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        buyerCompanyId: input.companyId,
      },
      select: {
        id: true,
        auctionId: true,
        buyerCompanyId: true,
        subtotal: true,
        commission: true,
        vat: true,
        total: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        auction: {
          select: {
            id: true,
            vehicle: {
              select: {
                brand: true,
                model: true,
              },
            },
          },
        },
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            stripePaymentIntentId: true,
          },
        },
      },
    }),
    prisma.company.findUnique({
      where: {
        id: input.companyId,
      },
      select: {
        name: true,
      },
    }),
  ]);

  if (!invoice) {
    return null;
  }

  const winnerCompany = buyerCompany?.name ?? "Buyer company";

  return {
    id: invoice.id,
    auctionId: invoice.auctionId,
    lotNumber: deriveLotNumber(invoice.auctionId),
    lotTitle: buildLotTitle(invoice.auction.vehicle?.brand, invoice.auction.vehicle?.model, invoice.auction.id),
    winnerCompany,
    winningAmountAed: Number(invoice.subtotal.toString()),
    commissionAed: Number(invoice.commission.toString()),
    vatAed: Number(invoice.vat.toString()),
    totalAed: Number(invoice.total.toString()),
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt.toISOString(),
    status: normalizeInvoiceStatus(invoice.status),
    stripePaymentIntentId: invoice.payments[0]?.stripePaymentIntentId ?? null,
  };
}

export async function readMyBids(input: Pick<BuyerReadQueryInput, "userId">): Promise<MyBidReadModel[]> {
  await sleep(40);

  const bids = await prisma.bid.findMany({
    where: {
      userId: input.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
    select: {
      id: true,
      auctionId: true,
      amount: true,
      createdAt: true,
      auction: {
        select: {
          id: true,
          state: true,
          endsAt: true,
          currentPrice: true,
          highestBidId: true,
          vehicle: {
            select: {
              brand: true,
              model: true,
            },
          },
        },
      },
    },
  });

  const bidsByAuction = new Map<
    string,
    {
      auctionId: string;
      lotTitle: string;
      endsAt: string;
      highestBidAed: number;
      myBidAed: number;
      status: AuctionStatus;
      latestBidAtMs: number;
      highestBidId: string | null;
      myBidIds: Set<string>;
    }
  >();

  for (const bid of bids) {
    const existing = bidsByAuction.get(bid.auctionId);
    const bidAmountAed = Number(bid.amount.toString());
    const highestBidAed = Number(bid.auction.currentPrice.toString());
    const lotTitle = buildLotTitle(bid.auction.vehicle?.brand, bid.auction.vehicle?.model, bid.auction.id);

    if (!existing) {
      bidsByAuction.set(bid.auctionId, {
        auctionId: bid.auctionId,
        lotTitle,
        endsAt: bid.auction.endsAt.toISOString(),
        highestBidAed,
        myBidAed: bidAmountAed,
        status: normalizeAuctionStatus(bid.auction.state),
        latestBidAtMs: bid.createdAt.getTime(),
        highestBidId: bid.auction.highestBidId,
        myBidIds: new Set([bid.id]),
      });
      continue;
    }

    existing.myBidAed = Math.max(existing.myBidAed, bidAmountAed);
    existing.highestBidAed = highestBidAed;
    existing.status = normalizeAuctionStatus(bid.auction.state);
    existing.highestBidId = bid.auction.highestBidId;
    existing.myBidIds.add(bid.id);
    existing.latestBidAtMs = Math.max(existing.latestBidAtMs, bid.createdAt.getTime());
  }

  return [...bidsByAuction.values()]
    .sort((left, right) => right.latestBidAtMs - left.latestBidAtMs)
    .map((item) => ({
      id: `mb-${item.auctionId}`,
      auctionId: item.auctionId,
      lotNumber: deriveLotNumber(item.auctionId),
      lotTitle: item.lotTitle,
      myBidAed: item.myBidAed,
      highestBidAed: item.highestBidAed,
      endsAt: item.endsAt,
      isWinning: item.highestBidId ? item.myBidIds.has(item.highestBidId) : false,
      status: item.status,
    }));
}

export async function readWatchlist(input: Pick<BuyerReadQueryInput, "userId">): Promise<MyBidReadModel[]> {
  await sleep(40);

  const savedLots = await prisma.savedLot.findMany({
    where: {
      userId: input.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      auctionId: true,
      auction: {
        select: {
          id: true,
          state: true,
          endsAt: true,
          currentPrice: true,
          vehicle: {
            select: {
              brand: true,
              model: true,
            },
          },
        },
      },
    },
  });

  return savedLots.map((savedLot) => ({
    id: savedLot.id,
    auctionId: savedLot.auctionId,
    lotNumber: deriveLotNumber(savedLot.auctionId),
    lotTitle: buildLotTitle(
      savedLot.auction.vehicle?.brand,
      savedLot.auction.vehicle?.model,
      savedLot.auction.id,
    ),
    myBidAed: 0,
    highestBidAed: Number(savedLot.auction.currentPrice.toString()),
    endsAt: savedLot.auction.endsAt.toISOString(),
    isWinning: false,
    status: normalizeAuctionStatus(savedLot.auction.state),
  }));
}

function formatActivityAed(amountAed: number): string {
  return `AED ${new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(amountAed)}`;
}

export async function readDashboard(input: DashboardQueryInput): Promise<DashboardReadModel> {
  await sleep(40);

  const issuedInvoiceWhere = input.companyId
    ? {
        buyerCompanyId: input.companyId,
        status: "ISSUED" as const,
      }
    : null;

  const [activeBidAuctions, bids, watching, wallet, invoicesDue, recentIssuedInvoices] = await Promise.all([
    prisma.bid.findMany({
      where: {
        userId: input.userId,
        auction: {
          state: "LIVE",
        },
      },
      distinct: ["auctionId"],
      select: {
        auctionId: true,
      },
    }),
    prisma.bid.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
      select: {
        id: true,
        auctionId: true,
        amount: true,
        createdAt: true,
        auction: {
          select: {
            id: true,
            state: true,
            highestBidId: true,
            currentPrice: true,
            vehicle: {
              select: {
                brand: true,
                model: true,
              },
            },
          },
        },
      },
    }),
    prisma.savedLot.count({
      where: {
        userId: input.userId,
      },
    }),
    prisma.wallet.findUnique({
      where: {
        userId: input.userId,
      },
      select: {
        balance: true,
      },
    }),
    issuedInvoiceWhere
      ? prisma.invoice.count({
          where: issuedInvoiceWhere,
        })
      : Promise.resolve(0),
    issuedInvoiceWhere
      ? prisma.invoice.findMany({
          where: issuedInvoiceWhere,
          orderBy: {
            issuedAt: "desc",
          },
          take: 6,
          select: {
            id: true,
            issuedAt: true,
            auctionId: true,
          },
        })
      : Promise.resolve([] as Array<{ id: string; issuedAt: Date; auctionId: string }>),
  ]);

  const bidsByAuction = new Map<
    string,
    {
      auctionId: string;
      lotTitle: string;
      state: AuctionState;
      highestBidId: string | null;
      currentPriceAed: number;
      latestBidAt: Date;
      myHighestBidAed: number;
      myBidIds: Set<string>;
    }
  >();

  for (const bid of bids) {
    const bidAmountAed = Number(bid.amount.toString());
    const currentPriceAed = Number(bid.auction.currentPrice.toString());
    const lotTitle = buildLotTitle(
      bid.auction.vehicle?.brand,
      bid.auction.vehicle?.model,
      bid.auction.id,
    );
    const existing = bidsByAuction.get(bid.auctionId);

    if (!existing) {
      bidsByAuction.set(bid.auctionId, {
        auctionId: bid.auctionId,
        lotTitle,
        state: bid.auction.state,
        highestBidId: bid.auction.highestBidId,
        currentPriceAed,
        latestBidAt: bid.createdAt,
        myHighestBidAed: bidAmountAed,
        myBidIds: new Set([bid.id]),
      });
      continue;
    }

    existing.myHighestBidAed = Math.max(existing.myHighestBidAed, bidAmountAed);
    existing.currentPriceAed = currentPriceAed;
    existing.highestBidId = bid.auction.highestBidId;
    existing.state = bid.auction.state;
    existing.myBidIds.add(bid.id);

    if (bid.createdAt > existing.latestBidAt) {
      existing.latestBidAt = bid.createdAt;
    }
  }

  const bidActivities: DashboardReadModel["recentActivity"] = [];

  for (const auctionSummary of bidsByAuction.values()) {
    const isWinning = auctionSummary.highestBidId
      ? auctionSummary.myBidIds.has(auctionSummary.highestBidId)
      : false;

    if (auctionSummary.state === "LIVE" && !isWinning) {
      bidActivities.push({
        id: `activity-outbid-${auctionSummary.auctionId}`,
        title: "Outbid alert",
        detail: `${auctionSummary.lotTitle} moved to ${formatActivityAed(auctionSummary.currentPriceAed)}`,
        createdAt: auctionSummary.latestBidAt.toISOString(),
      });
      continue;
    }

    if (isWinning) {
      bidActivities.push({
        id: `activity-winning-${auctionSummary.auctionId}`,
        title: "Bid accepted",
        detail: `${auctionSummary.lotTitle} accepted at ${formatActivityAed(auctionSummary.myHighestBidAed)}`,
        createdAt: auctionSummary.latestBidAt.toISOString(),
      });
    }
  }

  const invoiceActivities: DashboardReadModel["recentActivity"] = recentIssuedInvoices.map((invoice) => ({
    id: `activity-invoice-${invoice.id}`,
    title: "Invoice issued",
    detail: `Invoice ${deriveLotNumber(invoice.auctionId)} now due within 48h window`,
    createdAt: invoice.issuedAt.toISOString(),
  }));

  const recentActivity = [...bidActivities, ...invoiceActivities]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);

  return {
    activeBids: activeBidAuctions.length,
    watching,
    invoicesDue,
    depositBalanceAed: wallet ? Number(wallet.balance.toString()) : 0,
    recentActivity,
  };
}

export const DEFAULT_AUCTION_FILTERS: AuctionFilterState = {
  query: "",
  status: "ALL",
  location: "ALL",
  seller: "ALL",
  minPriceAed: null,
  maxPriceAed: null,
  minYear: null,
  maxMileageKm: null,
  endingSoonOnly: false,
  sortBy: "ENDING_SOON",
};

export function filterAndSortAuctions(auctions: AuctionLot[], filters: AuctionFilterState): AuctionLot[] {
  const query = filters.query.trim().toLowerCase();

  const filtered = auctions.filter((lot) => {
    if (filters.status !== "ALL" && lot.status !== filters.status) {
      return false;
    }

    if (filters.location !== "ALL" && lot.location !== filters.location) {
      return false;
    }

    if (filters.seller !== "ALL" && lot.seller !== filters.seller) {
      return false;
    }

    if (filters.minPriceAed !== null && lot.currentBidAed < filters.minPriceAed) {
      return false;
    }

    if (filters.maxPriceAed !== null && lot.currentBidAed > filters.maxPriceAed) {
      return false;
    }

    if (filters.minYear !== null && lot.year < filters.minYear) {
      return false;
    }

    if (filters.maxMileageKm !== null && lot.mileageKm > filters.maxMileageKm) {
      return false;
    }

    if (filters.endingSoonOnly) {
      const endsAtMs = new Date(lot.endsAt).getTime();
      if (endsAtMs - Date.now() > 1000 * 60 * 60 * 6) {
        return false;
      }
    }

    if (query.length > 0) {
      const haystack = `${lot.lotNumber} ${lot.title} ${lot.location} ${lot.seller}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((left, right) => {
    if (filters.sortBy === "LOWEST_PRICE") {
      return left.currentBidAed - right.currentBidAed;
    }

    if (filters.sortBy === "HIGHEST_BIDS") {
      return right.currentBidAed - left.currentBidAed;
    }

    if (filters.sortBy === "RECENTLY_ADDED") {
      return new Date(right.listedAt).getTime() - new Date(left.listedAt).getTime();
    }

    return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
  });
}

export function formatAed(amountAed: number, locale: SupportedLocale = "en"): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(amountAed);
}

export function formatShortDateTime(isoDate: string, locale: SupportedLocale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function formatLongDate(isoDate: string, locale: SupportedLocale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function getStatusLabel(status: AuctionStatus, locale: SupportedLocale = "en"): string {
  if (locale === "ru") {
    switch (status) {
      case "LIVE":
        return "В ЭФИРЕ";
      case "SCHEDULED":
        return "ЗАПЛАНИРОВАНО";
      case "PAYMENT_PENDING":
        return "ОЖИДАЕТ ОПЛАТЫ";
      case "DEFAULTED":
        return "ДЕФОЛТ";
      default:
        return "ЗАВЕРШЕНО";
    }
  }

  switch (status) {
    case "LIVE":
      return "LIVE";
    case "SCHEDULED":
      return "SCHEDULED";
    case "PAYMENT_PENDING":
      return "PAYMENT PENDING";
    case "DEFAULTED":
      return "DEFAULTED";
    default:
      return "ENDED";
  }
}

export function getInvoiceDeadlineTone(dueAt: string, status: InvoiceStatus, now = new Date()): "normal" | "warning" | "critical" | "resolved" {
  if (status !== "ISSUED") {
    return "resolved";
  }

  const diffHours = (new Date(dueAt).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 12) {
    return "critical";
  }

  if (diffHours <= 24) {
    return "warning";
  }

  return "normal";
}

export function describeInvoiceDeadline(
  dueAt: string,
  status: InvoiceStatus,
  now = new Date(),
  locale: SupportedLocale = "en",
): string {
  if (status === "PAID") {
    return locale === "ru" ? "Оплачено в установленный срок" : "Settled within the policy window";
  }

  if (status === "CANCELED") {
    return locale === "ru" ? "Отменено" : "Canceled";
  }

  if (status === "DEFAULTED") {
    return locale === "ru" ? "Просрочено по платежной политике" : "Defaulted under payment policy";
  }

  const diffMs = new Date(dueAt).getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours <= 0) {
    return locale === "ru" ? "Срок оплаты истек" : "Deadline exceeded";
  }

  return locale === "ru" ? `Осталось ${diffHours} ч` : `${diffHours}h remaining`;
}
