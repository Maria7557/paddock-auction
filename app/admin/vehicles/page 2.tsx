import { api } from "@/src/lib/api-client";
import { getLocalePreference } from "@/src/lib/display_preferences";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
import { withServerCookies } from "@/src/lib/server-api-options";

import { getAdminCopy } from "../i18n";
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
  marketPriceAed: number | null;
  auctionId: string | null;
  assignedEventId: string | null;
  assignedEventLabel: string | null;
  approvalStatusLabel: string | null;
};

type EventOption = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

async function getVehiclesData(
  locale: SupportedLocale,
): Promise<{ rows: VehicleRow[]; events: EventOption[] }> {
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const [vehiclesPayload, eventsPayload] = await Promise.all([
    api.admin.vehicles.list<{
      vehicles?: Array<{
        id: string;
        brand: string;
        model: string;
        year: number;
        vin: string;
        marketPriceAed: number | null;
        status: VehicleStatus;
        imageUrl: string | null;
        label: string;
        companyName?: string | null;
        latestAuctionId?: string | null;
        assignedEventId?: string | null;
        approvalStatusLabel?: string | null;
      }>;
    }>({ status: "ALL" }, requestOptions),
    api.admin.events
      .list<{
        events?: Array<{
          id: string;
          title: string;
          startsAt: string;
          endsAt: string;
          status: string;
        }>;
      }>(undefined, requestOptions)
      .catch(() => ({ events: [] })),
  ]);
  const t = getAdminCopy(locale);
  const events: EventOption[] = (eventsPayload.events ?? [])
    .filter((event) => event.status === "DRAFT" || event.status === "SCHEDULED")
    .map((event) => ({
      id: event.id,
      label: new Date(event.startsAt).toLocaleString(toIntlLocale(locale), {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
    }));
  const eventById = new Map(events.map((event) => [event.id, event]));

  const rows: VehicleRow[] = (vehiclesPayload.vehicles ?? []).map((vehicle) => {
    const title = vehicle.label?.trim() || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();
    const matchingEvent = vehicle.assignedEventId ? eventById.get(vehicle.assignedEventId) : null;

    return {
      id: vehicle.id,
      imageUrl: vehicle.imageUrl ?? null,
      title,
      vin: vehicle.vin,
      status: vehicle.status,
      companyName: vehicle.companyName?.trim() || t.defaults.fleetOperator,
      marketPriceAed: vehicle.marketPriceAed ?? null,
      auctionId: vehicle.latestAuctionId ?? null,
      assignedEventId: vehicle.assignedEventId ?? matchingEvent?.id ?? null,
      assignedEventLabel: matchingEvent?.label ?? null,
      approvalStatusLabel: vehicle.approvalStatusLabel ?? null,
    };
  });

  return {
    rows,
    events,
  };
}

export default async function AdminVehiclesPage() {
  const locale = await getLocalePreference();
  const { rows, events } = await getVehiclesData(locale);

  return <VehiclesTable rows={rows} events={events} locale={locale} />;
}
