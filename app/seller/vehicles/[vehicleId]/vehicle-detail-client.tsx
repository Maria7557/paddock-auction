"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { type SellerVehicleFormValues, VehicleForm } from "@/components/seller/VehicleForm";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";

type VehicleDetailResponse = {
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileageKm: number;
    regionSpec: string | null;
    bodyType: string | null;
    fuelType: string | null;
    transmission: string | null;
    airbags: string | null;
    color: string | null;
    condition: string | null;
    serviceHistory: string | null;
    description: string | null;
    damageMap: Record<string, "MINOR" | "MAJOR">;
    images: string[];
    photoUrls: string[];
    mulkiyaFrontUrl: string | null;
    mulkiyaBackUrl: string | null;
  };
  auction: {
    id: string;
    state: string;
    startingPriceAed: number;
    buyNowPriceAed: number;
    currentBidAed: number;
    startsAt: string;
    endsAt: string;
    inspectionDropoffDate: string | null;
    viewingEndsAt: string | null;
    auctionStartsAt: string | null;
    auctionEndsAt: string | null;
    bidsCount: number;
  };
};

type SellerVehicleDetailClientProps = {
  vehicleId: string;
};

function toEditValues(data: VehicleDetailResponse): SellerVehicleFormValues {
  return {
    brand: data.vehicle.brand,
    model: data.vehicle.model,
    year: String(data.vehicle.year),
    vin: data.vehicle.vin,
    regionSpec: data.vehicle.regionSpec ?? "",
    bodyType: data.vehicle.bodyType ?? "",
    fuelType: data.vehicle.fuelType ?? "",
    transmission: data.vehicle.transmission ?? "",
    airbags: data.vehicle.airbags ?? "UNKNOWN",
    color: data.vehicle.color ?? "",
    mileageKm: String(data.vehicle.mileageKm),
    condition: data.vehicle.condition ?? "",
    serviceHistory: data.vehicle.serviceHistory ?? "",
    description: data.vehicle.description ?? "",
    damageMap: data.vehicle.damageMap ?? {},
    photoUrls: data.vehicle.photoUrls ?? data.vehicle.images ?? [],
    mulkiyaFrontUrl: data.vehicle.mulkiyaFrontUrl ?? "",
    mulkiyaBackUrl: data.vehicle.mulkiyaBackUrl ?? "",
    startingPriceAed: String(data.auction.startingPriceAed),
    buyNowPriceAed: data.auction.buyNowPriceAed ? String(data.auction.buyNowPriceAed) : "",
    inspectionDropoffDate: data.auction.inspectionDropoffDate ? data.auction.inspectionDropoffDate.slice(0, 10) : "",
  };
}

export default function SellerVehicleDetailClient({ vehicleId }: SellerVehicleDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VehicleDetailResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const created = searchParams.get("created") === "1";

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/seller/vehicles/${vehicleId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as VehicleDetailResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Failed to load vehicle");
      }

      setData(payload as VehicleDetailResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const editValues = useMemo(() => {
    if (!data) {
      return undefined;
    }

    return toEditValues(data);
  }, [data]);

  async function handleEditSubmit(values: SellerVehicleFormValues): Promise<void> {
    const response = await fetch(`/api/seller/vehicles/${vehicleId}`, {
      method: "PATCH",
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
        airbags: values.airbags,
        color: values.color,
        mileageKm: Number(values.mileageKm),
        condition: values.condition,
        serviceHistory: values.serviceHistory,
        description: values.description,
        damageMap: values.damageMap,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to update vehicle");
    }

    setEditing(false);
    await loadDetail();
  }

  async function handleDeleteDraft(): Promise<void> {
    if (!data || data.auction.state !== "DRAFT") {
      return;
    }

    const confirmed = window.confirm("Delete this draft vehicle and draft auction?");

    if (!confirmed) {
      return;
    }

    setBusyDelete(true);

    try {
      const response = await fetch(`/api/seller/vehicles/${vehicleId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to delete draft");
      }

      router.push("/seller/vehicles");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setBusyDelete(false);
    }
  }

  if (loading) {
    return <p className="text-muted">Loading vehicle...</p>;
  }

  if (error) {
    return <p className="inline-note tone-error">{error}</p>;
  }

  if (!data) {
    return <p className="text-muted">Vehicle not found.</p>;
  }

  return (
    <section className="seller-section-stack">
      {created ? <p className="inline-note tone-success">Vehicle added and auction draft created</p> : null}

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <div>
            <h2>
              {data.vehicle.brand} {data.vehicle.model}
            </h2>
            <p className="text-muted">{data.vehicle.year}</p>
          </div>
          <AuctionStatusBadge state={data.auction.state} />
        </div>

        <p className="seller-detail-vin">VIN: {data.vehicle.vin}</p>
      </section>

      <section className="surface-panel seller-section-block">
        <h3>Specs</h3>
        <div className="seller-specs-grid">
          <article>
            <p>Region</p>
            <strong>{data.vehicle.regionSpec ?? "-"}</strong>
          </article>
          <article>
            <p>Body Type</p>
            <strong>{data.vehicle.bodyType ?? "-"}</strong>
          </article>
          <article>
            <p>Fuel</p>
            <strong>{data.vehicle.fuelType ?? "-"}</strong>
          </article>
          <article>
            <p>Transmission</p>
            <strong>{data.vehicle.transmission ?? "-"}</strong>
          </article>
          <article>
            <p>Airbags</p>
            <strong>{data.vehicle.airbags ?? "-"}</strong>
          </article>
          <article>
            <p>Mileage</p>
            <strong>{data.vehicle.mileageKm.toLocaleString("en-AE")} km</strong>
          </article>
          <article>
            <p>Condition</p>
            <strong>{data.vehicle.condition ?? "-"}</strong>
          </article>
          <article>
            <p>Service History</p>
            <strong>{data.vehicle.serviceHistory ?? "-"}</strong>
          </article>
          <article>
            <p>Color</p>
            <strong>{data.vehicle.color ?? "-"}</strong>
          </article>
        </div>
      </section>

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <h3>Linked Auction</h3>
          <Link href={`/seller/auctions/${data.auction.id}`} className="seller-inline-link">
            View Auction →
          </Link>
        </div>

        <div className="seller-kpi-row">
          <article>
            <p>Starting Price</p>
            <strong>{formatAed(data.auction.startingPriceAed)}</strong>
          </article>
          <article>
            <p>Buy Now Price</p>
            <strong>{data.auction.buyNowPriceAed ? formatAed(data.auction.buyNowPriceAed) : "-"}</strong>
          </article>
          <article>
            <p>Current Bid</p>
            <strong>{formatAed(data.auction.currentBidAed)}</strong>
          </article>
          <article>
            <p>Inspection Drop-off</p>
            <strong>{data.auction.inspectionDropoffDate ? formatSellerDateTime(data.auction.inspectionDropoffDate) : "-"}</strong>
          </article>
          <article>
            <p>Auction Starts</p>
            <strong>{formatSellerDateTime(data.auction.startsAt)}</strong>
          </article>
          <article>
            <p>Auction Ends</p>
            <strong>{formatSellerDateTime(data.auction.endsAt)}</strong>
          </article>
          <article>
            <p>Bid Count</p>
            <strong>{data.auction.bidsCount}</strong>
          </article>
        </div>
      </section>

      <section className="seller-inline-actions">
        <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
          Edit Vehicle
        </button>

        {data.auction.state === "DRAFT" ? (
          <button
            type="button"
            className="button button-secondary seller-danger-outline"
            onClick={() => void handleDeleteDraft()}
            disabled={busyDelete}
          >
            {busyDelete ? "Deleting..." : "Delete Draft"}
          </button>
        ) : null}
      </section>

      {editing && editValues ? (
        <div className="seller-modal-backdrop" role="dialog" aria-modal="true">
          <div className="seller-modal-panel seller-modal-wide">
            <h3>Edit Vehicle</h3>
            <VehicleForm
              initialValues={editValues}
              submitLabel="Save Changes"
              submittingLabel="Saving..."
              showAuctionFields={false}
              onSubmit={handleEditSubmit}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
