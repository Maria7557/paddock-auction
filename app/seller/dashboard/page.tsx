"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getToken, logout } from "@/src/lib/auth_client";

type SellerDashboardResponse = {
  company: {
    id: string;
    name: string;
    status: string;
    pendingApproval: boolean;
  };
  stats: {
    vehicles: {
      total: number;
      withActiveAuction: number;
      sold: number;
    };
    auctions: {
      draft: number;
      scheduled: number;
      live: number;
      closed: number;
      paymentPending: number;
    };
  };
  recentAuctions: Array<{
    id: string;
    state: string;
    currentBid: number;
    startsAt: string;
    endsAt: string;
    vehicleName: string;
  }>;
};

type VehicleCreateResponse = {
  id?: string;
  error_code?: string;
  error?: string;
  message?: string;
};

type AuctionCreateResponse = {
  auctionId?: string;
  error?: string;
  message?: string;
};

type SellerVehicleFormState = {
  brand: string;
  model: string;
  year: string;
  vin: string;
  mileage: string;
  color: string;
  description: string;
  startingPrice: string;
  reservePrice: string;
  startsAt: string;
  endsAt: string;
};

const initialFormState: SellerVehicleFormState = {
  brand: "",
  model: "",
  year: "",
  vin: "",
  mileage: "",
  color: "",
  description: "",
  startingPrice: "",
  reservePrice: "",
  startsAt: "",
  endsAt: "",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAmountAed(value: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

function companyStatusClass(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === "ACTIVE") {
    return "admin-status-badge admin-status-good";
  }

  if (normalized.includes("PENDING")) {
    return "admin-status-badge admin-status-warn";
  }

  return "admin-status-badge admin-status-bad";
}

function auctionStateClass(state: string): string {
  const normalized = state.toUpperCase();

  if (normalized === "LIVE" || normalized === "PAID") {
    return "admin-status-badge admin-status-good";
  }

  if (normalized === "PAYMENT_PENDING") {
    return "admin-status-badge admin-status-warn";
  }

  if (normalized === "SCHEDULED") {
    return "admin-status-badge seller-status-scheduled";
  }

  return "admin-status-badge";
}

export default function SellerDashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<SellerDashboardResponse | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<SellerVehicleFormState>(initialFormState);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const loadDashboard = useCallback(async (authToken: string): Promise<void> => {
    setLoadingDashboard(true);
    setDashboardError(null);

    try {
      const response = await fetch("/api/seller/dashboard", {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | SellerDashboardResponse
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          (payload as { message?: string; error?: string } | null)?.message ??
            (payload as { message?: string; error?: string } | null)?.error ??
            "Failed to load seller dashboard",
        );
      }

      setDashboard(payload as SellerDashboardResponse);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Unexpected dashboard error");
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    const authToken = getToken();

    if (!authToken) {
      window.location.href = "/login/seller";
      return;
    }

    setToken(authToken);
    void loadDashboard(authToken);
  }, [loadDashboard]);

  const companyStatus = useMemo(() => {
    return dashboard?.company.status ?? "UNKNOWN";
  }, [dashboard]);

  function updateField<K extends keyof SellerVehicleFormState>(field: K, value: SellerVehicleFormState[K]): void {
    setFormState((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function onSubmitVehicle(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token) {
      setFormError("Session expired. Please login again.");
      return;
    }

    const year = Number(formState.year);
    const mileage = Number(formState.mileage);
    const startingPrice = Number(formState.startingPrice);
    const reservePrice = formState.reservePrice.trim().length > 0 ? Number(formState.reservePrice) : undefined;

    if (!Number.isFinite(year) || year < 2000 || year > 2030) {
      setFormError("Year must be between 2000 and 2030.");
      return;
    }

    if (!Number.isFinite(mileage) || mileage < 0) {
      setFormError("Mileage must be a valid non-negative number.");
      return;
    }

    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      setFormError("Starting price must be greater than 0.");
      return;
    }

    const startsAtIso = new Date(formState.startsAt).toISOString();
    const endsAtIso = new Date(formState.endsAt).toISOString();

    if (!Number.isFinite(Date.parse(startsAtIso)) || !Number.isFinite(Date.parse(endsAtIso))) {
      setFormError("Auction start and end date must be valid.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    setFormNotice(null);

    try {
      const vehicleResponse = await fetch("/api/vehicles", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          brand: formState.brand,
          model: formState.model,
          year,
          mileage,
          vin: formState.vin,
        }),
      });

      const vehiclePayload = (await vehicleResponse.json().catch(() => null)) as VehicleCreateResponse | null;

      if (!vehicleResponse.ok || !vehiclePayload?.id) {
        throw new Error(
          vehiclePayload?.message ?? vehiclePayload?.error ?? vehiclePayload?.error_code ?? "Failed to create vehicle",
        );
      }

      const auctionResponse = await fetch("/api/auctions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          vehicleId: vehiclePayload.id,
          startingPrice,
          reservePrice,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
        }),
      });

      const auctionPayload = (await auctionResponse.json().catch(() => null)) as AuctionCreateResponse | null;

      if (!auctionResponse.ok) {
        throw new Error(
          auctionPayload?.message ?? auctionPayload?.error ?? "Vehicle created but auction creation failed",
        );
      }

      setFormNotice("Vehicle added and auction created as DRAFT");
      setFormState(initialFormState);
      setFormOpen(false);
      await loadDashboard(token);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unexpected submit error");
    } finally {
      setFormSubmitting(false);
    }
  }

  return (
    <section className="market-shell">
      <header className="surface-panel seller-dashboard-header">
        <div>
          <h1>Seller Dashboard</h1>
          <p className="text-muted">{dashboard ? dashboard.company.name : "Loading company..."}</p>
        </div>

        <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
          {dashboard ? <span className={companyStatusClass(companyStatus)}>{companyStatus}</span> : null}
          <button
            type="button"
            className="button button-secondary"
            style={{ borderColor: "#f0ccca", color: "var(--red-600)", minHeight: "40px", padding: "8px 14px" }}
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      <nav className="surface-panel seller-dashboard-nav" aria-label="Seller navigation">
        <Link href="/seller/dashboard" className="button button-secondary">
          Dashboard
        </Link>
        <Link href="/seller/vehicles" className="button button-secondary">
          My Vehicles
        </Link>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setFormOpen((previous) => !previous);
            setFormError(null);
            setFormNotice(null);
          }}
        >
          + Add Vehicle
        </button>
      </nav>

      {dashboard?.company.pendingApproval ? (
        <div className="surface-panel">
          <p className="inline-note tone-warning">
            Your company is under review. You can add vehicles as drafts.
          </p>
        </div>
      ) : null}

      {loadingDashboard ? (
        <div className="surface-panel">
          <p className="text-muted">Loading seller dashboard...</p>
        </div>
      ) : null}

      {dashboardError ? (
        <div className="surface-panel">
          <p className="inline-note tone-error">{dashboardError}</p>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-tile">
              <p>Total Vehicles</p>
              <strong>{dashboard.stats.vehicles.total}</strong>
            </article>
            <article className="metric-tile">
              <p>Draft Auctions</p>
              <strong>{dashboard.stats.auctions.draft}</strong>
            </article>
            <article className="metric-tile">
              <p>Live Auctions</p>
              <strong>{dashboard.stats.auctions.live}</strong>
            </article>
            <article className="metric-tile">
              <p>Sold</p>
              <strong>{dashboard.stats.vehicles.sold}</strong>
            </article>
          </section>

          <section className="surface-panel">
            <div className="inline-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2>Recent Auctions</h2>
            </div>
            <table className="admin-table" style={{ marginTop: "14px" }}>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>State</th>
                  <th>Starting Price</th>
                  <th>Starts At</th>
                  <th>Ends At</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentAuctions.map((auction) => (
                  <tr key={auction.id}>
                    <td>{auction.vehicleName}</td>
                    <td>
                      <span className={auctionStateClass(auction.state)}>{auction.state}</span>
                    </td>
                    <td>{formatAmountAed(auction.currentBid)}</td>
                    <td>{formatDate(auction.startsAt)}</td>
                    <td>{formatDate(auction.endsAt)}</td>
                  </tr>
                ))}
                {dashboard.recentAuctions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty-cell">
                      No auctions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {formOpen ? (
        <section className="surface-panel" id="add-vehicle">
          <h2>Add Vehicle</h2>
          <p className="text-muted">Create a vehicle entry and immediately open an auction draft.</p>

          <form className="seller-form" onSubmit={onSubmitVehicle}>
            <label>
              Brand
              <input
                type="text"
                value={formState.brand}
                onChange={(event) => updateField("brand", event.target.value)}
                required
              />
            </label>

            <label>
              Model
              <input
                type="text"
                value={formState.model}
                onChange={(event) => updateField("model", event.target.value)}
                required
              />
            </label>

            <label>
              Year
              <input
                type="number"
                min={2000}
                max={2030}
                value={formState.year}
                onChange={(event) => updateField("year", event.target.value)}
                required
              />
            </label>

            <label>
              VIN
              <input
                type="text"
                value={formState.vin}
                onChange={(event) => updateField("vin", event.target.value)}
                required
              />
            </label>

            <label>
              Mileage
              <input
                type="number"
                min={0}
                value={formState.mileage}
                onChange={(event) => updateField("mileage", event.target.value)}
                required
              />
            </label>

            <label>
              Color
              <input
                type="text"
                value={formState.color}
                onChange={(event) => updateField("color", event.target.value)}
              />
            </label>

            <label className="seller-form-full">
              Description
              <textarea
                rows={4}
                value={formState.description}
                onChange={(event) => updateField("description", event.target.value)}
              />
            </label>

            <label>
              Starting Price AED
              <input
                type="number"
                min={1}
                step="0.01"
                value={formState.startingPrice}
                onChange={(event) => updateField("startingPrice", event.target.value)}
                required
              />
            </label>

            <label>
              Reserve Price AED
              <input
                type="number"
                min={1}
                step="0.01"
                value={formState.reservePrice}
                onChange={(event) => updateField("reservePrice", event.target.value)}
              />
            </label>

            <label>
              Auction Start
              <input
                type="datetime-local"
                value={formState.startsAt}
                onChange={(event) => updateField("startsAt", event.target.value)}
                required
              />
            </label>

            <label>
              Auction End
              <input
                type="datetime-local"
                value={formState.endsAt}
                onChange={(event) => updateField("endsAt", event.target.value)}
                required
              />
            </label>

            <div className="seller-form-actions seller-form-full">
              <button type="submit" className="button button-primary" disabled={formSubmitting}>
                {formSubmitting ? "Saving..." : "Create Vehicle + Auction"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setFormOpen(false);
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>

          {formNotice ? <p className="inline-note tone-success" style={{ marginTop: "12px" }}>{formNotice}</p> : null}
          {formError ? <p className="inline-note tone-error" style={{ marginTop: "12px" }}>{formError}</p> : null}
        </section>
      ) : null}
    </section>
  );
}
