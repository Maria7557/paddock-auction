import { notFound } from "next/navigation";

import prisma from "@/src/lib/prisma";

import { EventDetailClient } from "./EventDetailClient";

type EventMeta = {
  title?: string;
  description?: string;
};

type EventOrder = {
  vehicleIds?: string[];
};

function parseMeta(reason: string | null): EventMeta {
  if (!reason) {
    return {};
  }

  try {
    return JSON.parse(reason) as EventMeta;
  } catch {
    return {};
  }
}

function parseOrder(reason: string | null): string[] {
  if (!reason) {
    return [];
  }

  try {
    const parsed = JSON.parse(reason) as EventOrder;

    return Array.isArray(parsed.vehicleIds) ? parsed.vehicleIds : [];
  } catch {
    return [];
  }
}

function toNumber(value: { toString(): string } | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.auction.findUnique({
    where: {
      id,
    },
    include: {
      transitions: {
        where: {
          trigger: {
            in: ["EVENT_META", "EVENT_ORDER"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!event) {
    notFound();
  }

  const eventLots = await prisma.auction.findMany({
    where: {
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    include: {
      vehicle: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const latestMeta = event.transitions.find((transition) => transition.trigger === "EVENT_META") ?? null;
  const latestOrder = event.transitions.find((transition) => transition.trigger === "EVENT_ORDER") ?? null;

  const meta = parseMeta(latestMeta?.reason ?? null);
  const order = parseOrder(latestOrder?.reason ?? null);

  const orderIndexByVehicleId = new Map(order.map((vehicleId, index) => [vehicleId, index]));

  const lots = eventLots
    .map((lot) => ({
      auctionId: lot.id,
      vehicleId: lot.vehicleId,
      title: `${lot.vehicle.brand} ${lot.vehicle.model} ${lot.vehicle.year}`,
      vin: lot.vehicle.vin,
      imageUrl: lot.vehicle.images[0] ?? null,
      marketPriceAed: toNumber(lot.vehicle.marketPrice),
      sequence:
        orderIndexByVehicleId.get(lot.vehicleId) ??
        order.length + eventLots.findIndex((item) => item.id === lot.id),
    }))
    .sort((a, b) => a.sequence - b.sequence)
    .map((item, index) => ({
      ...item,
      sequence: index + 1,
    }));

  const existingVehicleIds = new Set(lots.map((lot) => lot.vehicleId));

  const vehicles = await prisma.vehicle.findMany({
    include: {
      auctions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          state: true,
        },
      },
    },
    orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
  });

  const candidateVehicles = vehicles
    .filter((vehicle) => {
      if (existingVehicleIds.has(vehicle.id)) {
        return false;
      }

      const latestState = vehicle.auctions[0]?.state ?? "DRAFT";
      return latestState !== "CANCELED";
    })
    .map((vehicle) => ({
      id: vehicle.id,
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
    }));

  const title =
    meta.title?.trim() ||
    `Auction Event ${new Date(event.startsAt).toLocaleDateString("en-GB")}`;

  return (
    <EventDetailClient
      eventId={event.id}
      title={title}
      description={meta.description?.trim() ?? ""}
      status={event.state}
      startsAt={event.startsAt.toISOString()}
      lots={lots}
      candidates={candidateVehicles}
    />
  );
}
