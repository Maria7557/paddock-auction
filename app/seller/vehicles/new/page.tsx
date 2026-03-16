"use client";

import { useRouter } from "next/navigation";

import { EMPTY_VEHICLE_FORM, type SellerVehicleFormValues, VehicleForm } from "@/components/seller/VehicleForm";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

type CreateSellerVehicleResponse = {
  vehicle?: {
    id?: string;
  };
  vehicleId?: string;
  auctionId?: string;
};

function toStartOfDayIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export default function SellerNewVehiclePage() {
  const router = useRouter();

  async function handleSubmit(values: SellerVehicleFormValues): Promise<void> {
    try {
      const payload = await api.seller.vehicles.create<CreateSellerVehicleResponse>({
        brand: values.brand,
        model: values.model,
        year: Number(values.year),
        vin: values.vin,
        regionSpec: values.regionSpec || undefined,
        bodyType: values.bodyType || undefined,
        fuelType: values.fuelType || undefined,
        transmission: values.transmission || undefined,
        airbags: values.airbags || undefined,
        exteriorColor: values.color || undefined,
        mileage: Number(values.mileageKm),
        condition: values.condition || undefined,
        serviceHistory: values.serviceHistory || undefined,
        description: values.description || undefined,
        damageMap: values.damageMap,
        images: values.photoUrls,
        mulkiyaFrontUrl: values.mulkiyaFrontUrl || undefined,
        mulkiyaBackUrl: values.mulkiyaBackUrl || undefined,
        startingPrice: Number(values.startingPriceAed),
        buyNowPrice: values.buyNowPriceAed.trim() ? Number(values.buyNowPriceAed) : undefined,
        inspectionDropoffDate: values.inspectionDropoffDate
          ? toStartOfDayIso(values.inspectionDropoffDate)
          : undefined,
      });

      const vehicleId = payload.vehicleId ?? payload.vehicle?.id;
      const auctionId = payload.auctionId;

      if (!vehicleId) {
        throw new Error("Failed to create vehicle");
      }

      if (auctionId) {
        router.push(`/seller/auctions/${auctionId}?created=1`);
        return;
      }

      router.push(`/seller/vehicles/${vehicleId}?created=1&setup=partial`);
    } catch (error) {
      throw new Error(getApiErrorMessage(error, "Failed to create vehicle"));
    }
  }

  return (
    <section className="seller-section-stack">
      <section className="surface-panel seller-section-block">
        <h2>Add Vehicle</h2>
        <p className="text-muted">Create vehicle and auction draft in one step.</p>

        <VehicleForm
          initialValues={EMPTY_VEHICLE_FORM}
          submitLabel="Create Vehicle + Draft"
          submittingLabel="Creating..."
          onSubmit={handleSubmit}
          onCancel={() => router.push("/seller/vehicles")}
        />
      </section>
    </section>
  );
}
