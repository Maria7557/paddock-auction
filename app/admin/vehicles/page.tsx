import prisma from "@/src/lib/prisma";

import { VehiclesTable } from "./VehiclesTable";

type VehicleStatus = "PENDING" | "APPROVED" | "REJECTED";

type VehicleRow = {
  id: string;
  imageUrl: string | null;
  title: string;
  vin: string;
  status: VehicleStatus;
  companyName: string;
  marketPriceAed: number;
  auctionId: string | null;
  assignedEventId: string | null;
  assignedEventLabel: string | null;
};

type EventOption = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

function toNumber(value: { toString(): string } | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

function resolveVehicleStatus(state: string | null): VehicleStatus {
  if (!state || state === "DRAFT") {
    return "PENDING";
  }

  if (state === "CANCELED") {
    return "REJECTED";
  }

  return "APPROVED";
}

async function getVehiclesData(): Promise<{ rows: VehicleRow[]; events: EventOption[] }> {
  const [vehicles, scheduledEvents] = await Promise.all([
    prisma.vehicle.findMany({
      include: {
        auctions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            state: true,
            startsAt: true,
            endsAt: true,
            sellerCompanyId: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    }),
    prisma.auction.findMany({
      where: {
        state: "SCHEDULED",
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const sellerCompanyIds = [...new Set(vehicles.map((v) => v.auctions[0]?.sellerCompanyId).filter(Boolean))] as string[];

  const companies = await prisma.company.findMany({
    where: {
      id: {
        in: sellerCompanyIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const companyById = new Map(companies.map((company) => [company.id, company.name]));

  const events: EventOption[] = scheduledEvents.map((event) => ({
    id: event.id,
    label: new Date(event.startsAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
  }));

  const rows: VehicleRow[] = vehicles.map((vehicle) => {
    const latestAuction = vehicle.auctions[0] ?? null;
    const matchingEvent =
      latestAuction && latestAuction.state === "SCHEDULED"
        ? events.find(
            (event) =>
              event.startsAt === latestAuction.startsAt.toISOString() &&
              event.endsAt === latestAuction.endsAt.toISOString(),
          )
        : undefined;

    return {
      id: vehicle.id,
      imageUrl: vehicle.images[0] ?? null,
      title: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      vin: vehicle.vin,
      status: resolveVehicleStatus(latestAuction?.state ?? null),
      companyName: latestAuction?.sellerCompanyId
        ? companyById.get(latestAuction.sellerCompanyId) ?? "Fleet Operator"
        : "Fleet Operator",
      marketPriceAed: toNumber(vehicle.marketPrice),
      auctionId: latestAuction?.id ?? null,
      assignedEventId: matchingEvent?.id ?? null,
      assignedEventLabel: matchingEvent?.label ?? null,
    };
  });

  return {
    rows,
    events,
  };
}

export default async function AdminVehiclesPage() {
  const { rows, events } = await getVehiclesData();

  return <VehiclesTable rows={rows} events={events} />;
}
