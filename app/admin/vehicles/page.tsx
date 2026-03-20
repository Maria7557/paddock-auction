import { getLocalePreference } from "@/src/lib/display_preferences";
import type { SupportedLocale } from "@/src/i18n/routing";
import { withServerCookies } from "@/src/lib/server-api-options";
import { api } from "@/src/lib/api-client";

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
  auctionId: string | null;
};

async function getVehiclesData(locale: SupportedLocale): Promise<{ rows: VehicleRow[] }> {
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const vehiclesPayload = await api.admin.vehicles.list<{
    vehicles?: Array<{
      id: string;
      brand: string;
      model: string;
      year: number;
      vin: string;
      status: VehicleStatus;
      imageUrl: string | null;
      label: string;
      companyName?: string | null;
      latestAuctionId?: string | null;
    }>;
  }>({ status: "ALL" }, requestOptions);
  const t = getAdminCopy(locale);

  const rows: VehicleRow[] = (vehiclesPayload.vehicles ?? []).map((vehicle) => {
    const title = vehicle.label?.trim() || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();

    return {
      id: vehicle.id,
      imageUrl: vehicle.imageUrl ?? null,
      title,
      vin: vehicle.vin,
      status: vehicle.status,
      companyName: vehicle.companyName?.trim() || t.defaults.fleetOperator,
      auctionId: vehicle.latestAuctionId ?? null,
    };
  });

  return {
    rows,
  };
}

export default async function AdminVehiclesPage() {
  const locale = await getLocalePreference();
  const { rows } = await getVehiclesData(locale);

  return <VehiclesTable rows={rows} locale={locale} />;
}
