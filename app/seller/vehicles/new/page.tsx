"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EMPTY_VEHICLE_FORM, type SellerVehicleFormValues, VehicleForm } from "@/components/seller/VehicleForm";

export default function SellerNewVehiclePage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(values: SellerVehicleFormValues): Promise<void> {
    const response = await fetch("/api/seller/vehicles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        brand: values.brand,
        model: values.model,
        year: Number(values.year),
        vin: values.vin,
        regionSpec: values.regionSpec,
        bodyType: values.bodyType,
        fuelType: values.fuelType,
        transmission: values.transmission,
        color: values.color,
        mileageKm: Number(values.mileageKm),
        condition: values.condition,
        serviceHistory: values.serviceHistory,
        description: values.description,
        sellerNotes: values.sellerNotes,
        startingPriceAed: Number(values.startingPriceAed),
        reservePriceAed: values.reservePriceAed ? Number(values.reservePriceAed) : undefined,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { vehicleId?: string; message?: string; error?: string }
      | null;

    if (!response.ok || !payload?.vehicleId) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to create vehicle");
    }

    setNotice("Vehicle added and auction draft created");
    router.push(`/seller/vehicles/${payload.vehicleId}?created=1`);
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
