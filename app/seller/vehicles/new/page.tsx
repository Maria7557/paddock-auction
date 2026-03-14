"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EMPTY_VEHICLE_FORM, type SellerVehicleFormValues, VehicleForm } from "@/components/seller/VehicleForm";
import { api, getApiErrorMessage } from "@/src/lib/api-client";

export default function SellerNewVehiclePage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(values: SellerVehicleFormValues): Promise<void> {
    try {
      const payload = await api.seller.vehicles.create<{ vehicleId?: string }>({
        brand: values.brand,
        model: values.model,
        year: Number(values.year),
        vin: values.vin,
        regionSpec: values.regionSpec,
        bodyType: values.bodyType,
        fuelType: values.fuelType,
        transmission: values.transmission,
        airbags: values.airbags,
        color: values.color,
        mileageKm: Number(values.mileageKm),
        condition: values.condition,
        serviceHistory: values.serviceHistory,
        description: values.description,
        damageMap: values.damageMap,
        photoUrls: values.photoUrls,
        mulkiyaFrontUrl: values.mulkiyaFrontUrl,
        mulkiyaBackUrl: values.mulkiyaBackUrl,
        startingPriceAed: Number(values.startingPriceAed),
        buyNowPriceAed: values.buyNowPriceAed ? Number(values.buyNowPriceAed) : undefined,
        inspectionDropoffDate: values.inspectionDropoffDate,
      });

      if (!payload?.vehicleId) {
        throw new Error("Failed to create vehicle");
      }

      setNotice("Vehicle added and auction draft created");
      router.push(`/seller/vehicles/${payload.vehicleId}?created=1`);
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

        {notice ? <p className="inline-note tone-success">{notice}</p> : null}
      </section>
    </section>
  );
}
