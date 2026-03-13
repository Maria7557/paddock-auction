import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { VehiclesTable } from "./VehiclesTable";

export const dynamic = "force-dynamic";

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
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const [vehiclesPayload, scheduledEventsPayload] = await Promise.all([
    api.admin.vehicles.list<{
      vehicles?: Array<{
        id: string;
        brand: string;
        model: string;
        year: number;
        vin: string;
        marketPriceAed: number;
        status: string;
        imageUrl: string | null;
        label: string;
        latestAuctionId?: string | null;
      }>;
    }>({ status: "ALL" }, requestOptions),
    api.admin.events.list<{
      events?: Array<{
        id: string;
        title: string;
        startsAt: string;
        endsAt: string;
      }>;
    }>({ status: "SCHEDULED" }, requestOptions).catch(() => ({ events: [] })),
  ]);
  const scheduledEvents = scheduledEventsPayload.events ?? [];
  const eventDetails = await Promise.all(
    scheduledEvents.map((event) =>
      api.admin.events.get<{
        id: string;
        lots?: Array<{
          vehicleId: string;
        }>;
      }>(event.id, requestOptions).catch(() => null),
    ),
  );
  const eventByVehicleId = new Map<string, EventOption>();
  const events: EventOption[] = scheduledEvents.map((event) => ({
    id: event.id,
    label: new Date(event.startsAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  }));

  scheduledEvents.forEach((event, index) => {
    for (const lot of eventDetails[index]?.lots ?? []) {
      eventByVehicleId.set(lot.vehicleId, events[index]);
    }
  });

  const rows: VehicleRow[] = (vehiclesPayload.vehicles ?? []).map((vehicle) => {
    const title = vehicle.label?.trim() || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();
    const matchingEvent = eventByVehicleId.get(vehicle.id);

    return {
      id: vehicle.id,
      imageUrl: vehicle.imageUrl ?? null,
      title,
      vin: vehicle.vin,
      status: resolveVehicleStatus(vehicle.status ?? null),
      companyName: "Fleet Operator",
      marketPriceAed: Number(vehicle.marketPriceAed ?? 0),
      auctionId: vehicle.latestAuctionId ?? null,
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
