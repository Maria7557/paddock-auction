import { disconnectPrisma, prisma } from "../db";

type DuplicateVehicleSummary = {
  vehicleId: string;
  keeperAuctionId: string;
  deletedAuctionIds: string[];
  skippedAuctionIds: string[];
};

type CleanupSummary = {
  duplicateVehicles: number;
  deletedCount: number;
  skippedCount: number;
  vehicles: DuplicateVehicleSummary[];
};

type AuctionCandidate = {
  id: string;
  state: string;
  createdAt: Date;
  vehicleId: string;
  bidsCount: number;
  eventLotsCount: number;
  hasInvoice: boolean;
};

function pickKeeper(auctions: AuctionCandidate[]): AuctionCandidate {
  const draftAuctions = auctions
    .filter((auction) => auction.state === "DRAFT")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  if (draftAuctions.length > 0) {
    return draftAuctions[0];
  }

  const sortedAuctions = [...auctions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return sortedAuctions[0];
}

async function cleanupDuplicateAuctions(): Promise<CleanupSummary> {
  const duplicateVehicles = await prisma.auction.groupBy({
    by: ["vehicleId"],
    _count: {
      _all: true,
    },
    having: {
      vehicleId: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  const summary: CleanupSummary = {
    duplicateVehicles: duplicateVehicles.length,
    deletedCount: 0,
    skippedCount: 0,
    vehicles: [],
  };

  for (const duplicateVehicle of duplicateVehicles) {
    const auctions = await prisma.auction.findMany({
      where: {
        vehicleId: duplicateVehicle.vehicleId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        state: true,
        createdAt: true,
        vehicleId: true,
        invoice: {
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            bids: true,
            eventLots: true,
          },
        },
      },
    });

    const candidates: AuctionCandidate[] = auctions.map((auction) => ({
      id: auction.id,
      state: auction.state,
      createdAt: auction.createdAt,
      vehicleId: auction.vehicleId,
      bidsCount: auction._count.bids,
      eventLotsCount: auction._count.eventLots,
      hasInvoice: auction.invoice !== null,
    }));

    const keeper = pickKeeper(candidates);
    const deletedAuctionIds: string[] = [];
    const skippedAuctionIds: string[] = [];

    console.log(`Vehicle ${duplicateVehicle.vehicleId}: keeper ${keeper.id} (${keeper.state})`);

    for (const auction of candidates) {
      if (auction.id === keeper.id) {
        continue;
      }

      const canDelete = auction.bidsCount === 0 && auction.eventLotsCount === 0 && !auction.hasInvoice;

      if (!canDelete) {
        skippedAuctionIds.push(auction.id);
        summary.skippedCount += 1;
        console.warn(
          `WARN skip auction ${auction.id} for vehicle ${auction.vehicleId} (bids=${auction.bidsCount}, invoice=${auction.hasInvoice}, eventLots=${auction.eventLotsCount})`,
        );
        continue;
      }

      try {
        await prisma.auction.delete({
          where: {
            id: auction.id,
          },
        });

        deletedAuctionIds.push(auction.id);
        summary.deletedCount += 1;
        console.log(`DELETE auction ${auction.id} for vehicle ${auction.vehicleId}`);
      } catch (error) {
        skippedAuctionIds.push(auction.id);
        summary.skippedCount += 1;
        console.warn(
          `WARN failed to delete auction ${auction.id} for vehicle ${auction.vehicleId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    summary.vehicles.push({
      vehicleId: duplicateVehicle.vehicleId,
      keeperAuctionId: keeper.id,
      deletedAuctionIds,
      skippedAuctionIds,
    });
  }

  return summary;
}

async function main(): Promise<void> {
  const summary = await cleanupDuplicateAuctions();

  console.log("Cleanup summary");
  console.log(JSON.stringify(summary, null, 2));
}

void main()
  .catch((error: unknown) => {
    console.error("Duplicate auction cleanup failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
