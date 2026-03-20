"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { type SellerVehicleFormValues, VehicleForm } from "@/components/seller/VehicleForm";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { formatAed, formatSellerAuctionBid, formatSellerDateTime } from "@/components/seller/utils";

type VehicleDetailResponse = {
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileage: number;
    regionSpec: string | null;
    bodyType: string | null;
    fuelType: string | null;
    transmission: string | null;
    airbags: string | null;
    exteriorColor: string | null;
    condition: string | null;
    serviceHistory: string | null;
    description: string | null;
    damageMap: Record<string, "MINOR" | "MAJOR">;
    images: string[];
    photoUrls: string[];
    mulkiyaFrontUrl: string | null;
    mulkiyaBackUrl: string | null;
  };
  latestAuction: {
    id: string;
    state: string;
    buyNowPrice: number | null;
    currentPrice: number;
    startsAt: string;
    endsAt: string;
    inspectionDropoffDate: string | null;
    viewingEndsAt: string | null;
    auctionStartsAt: string | null;
    auctionEndsAt: string | null;
  } | null;
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
    color: data.vehicle.exteriorColor ?? "",
    mileageKm: String(data.vehicle.mileage),
    condition: data.vehicle.condition ?? "",
    serviceHistory: data.vehicle.serviceHistory ?? "",
    description: data.vehicle.description ?? "",
    damageMap: data.vehicle.damageMap ?? {},
    photoUrls: data.vehicle.photoUrls ?? data.vehicle.images ?? [],
    mulkiyaFrontUrl: data.vehicle.mulkiyaFrontUrl ?? "",
    mulkiyaBackUrl: data.vehicle.mulkiyaBackUrl ?? "",
    buyNowPriceAed: data.latestAuction?.buyNowPrice ? String(data.latestAuction.buyNowPrice) : "",
    inspectionDropoffDate: data.latestAuction?.inspectionDropoffDate
      ? data.latestAuction.inspectionDropoffDate.slice(0, 10)
      : "",
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
      const payload = await api.seller.vehicles.get<VehicleDetailResponse>(vehicleId, { cache: "no-store" });
      setData(payload);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unexpected error"));
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
    await api.seller.vehicles.update(vehicleId, {
        brand: values.brand,
        model: values.model,
        year: Number(values.year),
        vin: values.vin,
        regionSpec: values.regionSpec,
        bodyType: values.bodyType,
        fuelType: values.fuelType,
        transmission: values.transmission,
        airbags: values.airbags,
        exteriorColor: values.color,
        mileage: Number(values.mileageKm),
        condition: values.condition,
        serviceHistory: values.serviceHistory,
        description: values.description,
        damageMap: values.damageMap,
    });

    setEditing(false);
    await loadDetail();
  }

  async function handleDeleteDraft(): Promise<void> {
    if (!data || data.latestAuction?.state !== "DRAFT") {
      return;
    }

    const confirmed = window.confirm("Delete this draft vehicle and draft auction?");

    if (!confirmed) {
      return;
    }

    setBusyDelete(true);

    try {
      await api.seller.vehicles.remove(vehicleId);

      router.push("/seller/vehicles");
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, "Delete failed"));
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

  const auction = data.latestAuction;

  return (
    <section className="seller-section-stack">
      {created ? <p className="inline-note tone-success">Vehicle added. FleetBid admin will schedule the auction separately.</p> : null}

      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <div>
            <h2>
              {data.vehicle.brand} {data.vehicle.model}
            </h2>
            <p className="text-muted">{data.vehicle.year}</p>
          </div>
          {auction ? <AuctionStatusBadge state={auction.state} /> : null}
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
            <strong>{data.vehicle.mileage.toLocaleString("en-AE")} km</strong>
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
            <strong>{data.vehicle.exteriorColor ?? "-"}</strong>
          </article>
        </div>
      </section>

      {auction ? (
      <section className="surface-panel seller-section-block">
        <div className="seller-section-head">
          <h3>Linked Auction</h3>
          <Link href={`/seller/auctions/${auction.id}`} className="seller-inline-link">
            View Auction →
          </Link>
        </div>

        <div className="seller-kpi-row">
          <article>
            <p>Buy Now Price</p>
            <strong>{auction.buyNowPrice ? formatAed(auction.buyNowPrice) : "-"}</strong>
          </article>
          <article>
            <p>Current Bid</p>
            <strong>{formatSellerAuctionBid(auction.currentPrice)}</strong>
          </article>
          {auction.state === "DRAFT" ? (
            <article>
              <p>Auction Schedule</p>
              <strong>Coming soon</strong>
            </article>
          ) : (
            <>
              <article>
                <p>Auction Starts</p>
                <strong>{formatSellerDateTime(auction.startsAt)}</strong>
              </article>
              <article>
                <p>Auction Ends</p>
                <strong>{formatSellerDateTime(auction.endsAt)}</strong>
              </article>
            </>
          )}
        </div>

        {auction.state === "DRAFT" ? (
          <p className="text-muted" style={{ marginTop: "12px" }}>
            Inspection drop-off is shared with FleetBid admin as preparation info only. The live auction date appears
            here after admin assigns the event.
          </p>
        ) : null}
      </section>
      ) : null}

      <section className="seller-inline-actions">
        <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
          Edit Vehicle
        </button>

        {auction?.state === "DRAFT" ? (
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
