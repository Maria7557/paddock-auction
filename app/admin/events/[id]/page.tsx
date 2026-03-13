import { notFound } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventDetailClient } from "./EventDetailClient";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const event = await api.admin.events.get<{
    id: string;
    title: string;
    description: string;
    status: string;
    startsAt: string;
    lots?: Array<{
      auctionId: string;
      vehicleId: string;
      title: string;
      vin: string;
      imageUrl: string | null;
      marketPriceAed: number;
    }>;
  }>(id, requestOptions).catch(() => null);

  if (!event) {
    notFound();
  }

  const lots = (event.lots ?? []).map((lot, index) => ({
    ...lot,
    sequence: index + 1,
  }));

  const existingVehicleIds = new Set(lots.map((lot) => lot.vehicleId));
  const vehiclesPayload = await api.admin.vehicles.list<{
    vehicles?: Array<{
      id: string;
      label: string;
    }>;
  }>({ status: "APPROVED", unassigned: "true" }, requestOptions).catch(() => ({ vehicles: [] }));
  const candidateVehicles = (vehiclesPayload.vehicles ?? []).filter((vehicle) => !existingVehicleIds.has(vehicle.id));

  return (
    <EventDetailClient
      eventId={event.id}
      title={event.title}
      description={event.description ?? ""}
      status={event.status}
      startsAt={event.startsAt}
      lots={lots}
      candidates={candidateVehicles}
    />
  );
}
