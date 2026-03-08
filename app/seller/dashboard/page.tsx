"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getToken, logout } from "@/src/lib/auth_client";
import {
  BODY_TYPES,
  COLORS,
  CONDITIONS,
  FUEL_TYPES,
  REGION_SPECS,
  SERVICE_HISTORY_OPTIONS,
  TRANSMISSION_TYPES,
  UAE_BRANDS,
  YEARS,
  fetchNhtsaModels,
} from "@/src/lib/vehicle_data";

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

type BrandSource = "uae" | "nhtsa" | "other";

type SellerVehicleFormState = {
  brand: string;
  model: string;
  year: string;
  vin: string;
  regionSpec: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  mileageKm: string;
  color: string;
  condition: string;
  serviceHistory: string;
  description: string;
  startingPrice: string;
  reservePrice: string;
  startsAt: string;
  endsAt: string;
  sellerNotes: string;
};

const initialFormState: SellerVehicleFormState = {
  brand: "",
  model: "",
  year: "",
  vin: "",
  regionSpec: "",
  bodyType: "",
  fuelType: "",
  transmission: "",
  mileageKm: "",
  color: "",
  condition: "",
  serviceHistory: "",
  description: "",
  startingPrice: "",
  reservePrice: "",
  startsAt: "",
  endsAt: "",
  sellerNotes: "",
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

function normalizeBrandLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toBrandLabel(brandKey: string): string {
  return brandKey.replaceAll("_", " ");
}

function resolveUaeBrandKey(input: string, uaeBrandKeys: string[]): string | null {
  const normalized = normalizeBrandLabel(input).toLowerCase();

  if (!normalized) {
    return null;
  }

  for (const key of uaeBrandKeys) {
    if (key.toLowerCase() === normalized || toBrandLabel(key).toLowerCase() === normalized) {
      return key;
    }
  }

  return null;
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

  const [brandSource, setBrandSource] = useState<BrandSource>("uae");
  const [nhtsaModels, setNhtsaModels] = useState<string[]>([]);
  const [loadingNhtsaModels, setLoadingNhtsaModels] = useState(false);
  const [nhtsaFetched, setNhtsaFetched] = useState(false);

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

  const uaeBrandKeys = useMemo(() => Object.keys(UAE_BRANDS), []);

  const filteredUaeBrandLabels = useMemo(() => {
    const query = normalizeBrandLabel(formState.brand).toLowerCase();

    const labels = uaeBrandKeys.map((key) => toBrandLabel(key));

    if (!query) {
      return labels;
    }

    return labels.filter((label) => label.toLowerCase().includes(query));
  }, [formState.brand, uaeBrandKeys]);

  const matchedUaeBrandKey = useMemo(
    () => resolveUaeBrandKey(formState.brand, uaeBrandKeys),
    [formState.brand, uaeBrandKeys],
  );

  const uaeModels = useMemo(() => {
    if (!matchedUaeBrandKey) {
      return [];
    }

    return UAE_BRANDS[matchedUaeBrandKey] ?? [];
  }, [matchedUaeBrandKey]);

  useEffect(() => {
    setNhtsaModels([]);
    setNhtsaFetched(false);
  }, [formState.brand, formState.year]);

  function updateField<K extends keyof SellerVehicleFormState>(field: K, value: SellerVehicleFormState[K]): void {
    setFormState((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function onBrandChange(nextValue: string): void {
    if (nextValue === "Other brand") {
      setBrandSource("other");
      setFormState((previous) => ({
        ...previous,
        brand: "",
        model: "",
      }));
      return;
    }

    const normalized = normalizeBrandLabel(nextValue);
    const matchedKey = resolveUaeBrandKey(normalized, uaeBrandKeys);

    setBrandSource(matchedKey ? "uae" : normalized.length > 0 ? "nhtsa" : "uae");

    setFormState((previous) => ({
      ...previous,
      brand: matchedKey ? toBrandLabel(matchedKey) : normalized,
      model: "",
    }));
  }

  async function onFetchModels(): Promise<void> {
    if (!formState.brand.trim()) {
      setFormError("Enter a brand before fetching models.");
      return;
    }

    setLoadingNhtsaModels(true);
    setFormError(null);

    try {
      const yearValue = Number(formState.year);
      const year = Number.isFinite(yearValue) && yearValue > 0 ? yearValue : new Date().getUTCFullYear();
      const models = await fetchNhtsaModels(formState.brand.trim(), year);
      setNhtsaModels(models);
      setNhtsaFetched(true);

      if (models.length === 0) {
        setFormError("No NHTSA models found. Enter model manually.");
      }
    } catch {
      setFormError("Failed to fetch models from NHTSA.");
      setNhtsaFetched(true);
      setNhtsaModels([]);
    } finally {
      setLoadingNhtsaModels(false);
    }
  }

  async function onSubmitVehicle(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token) {
      setFormError("Session expired. Please login again.");
      return;
    }

    const year = Number(formState.year);
    const mileageKm = Number(formState.mileageKm);
    const startingPrice = Number(formState.startingPrice);
    const reservePrice = formState.reservePrice.trim().length > 0 ? Number(formState.reservePrice) : undefined;

    if (!Number.isFinite(year) || year < 1990 || year > 2026) {
      setFormError("Year must be between 1990 and 2026.");
      return;
    }

    if (!Number.isFinite(mileageKm) || mileageKm < 0) {
      setFormError("Mileage must be a valid non-negative number.");
      return;
    }

    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      setFormError("Starting price must be greater than 0.");
      return;
    }

    const startsAtTimestamp = Date.parse(formState.startsAt);
    const endsAtTimestamp = Date.parse(formState.endsAt);

    if (!Number.isFinite(startsAtTimestamp) || !Number.isFinite(endsAtTimestamp)) {
      setFormError("Auction start and end date must be valid.");
      return;
    }

    const startsAtIso = new Date(startsAtTimestamp).toISOString();
    const endsAtIso = new Date(endsAtTimestamp).toISOString();

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
          vin: formState.vin,
          mileageKm,
          color: formState.color,
          fuelType: formState.fuelType,
          transmission: formState.transmission,
          bodyType: formState.bodyType,
          regionSpec: formState.regionSpec,
          condition: formState.condition,
          serviceHistory: formState.serviceHistory,
          description: formState.description,
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
          sellerNotes: formState.sellerNotes,
        }),
      });

      const auctionPayload = (await auctionResponse.json().catch(() => null)) as AuctionCreateResponse | null;

      if (!auctionResponse.ok) {
        throw new Error(
          auctionPayload?.message ?? auctionPayload?.error ?? "Vehicle created but auction creation failed",
        );
      }

      setFormNotice("Vehicle created and auction draft opened");
      setFormState(initialFormState);
      setBrandSource("uae");
      setNhtsaModels([]);
      setNhtsaFetched(false);
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
                list="uae-brand-options"
                type="text"
                value={formState.brand}
                placeholder="Type or choose a UAE brand"
                onChange={(event) => onBrandChange(event.target.value)}
                required
              />
              <datalist id="uae-brand-options">
                {filteredUaeBrandLabels.map((brandLabel) => (
                  <option key={brandLabel} value={brandLabel} />
                ))}
                <option value="Other brand" />
              </datalist>
            </label>

            <label>
              Model
              {matchedUaeBrandKey ? (
                <select value={formState.model} onChange={(event) => updateField("model", event.target.value)} required>
                  <option value="" disabled>
                    Select model
                  </option>
                  {uaeModels.map((modelOption) => (
                    <option key={modelOption} value={modelOption}>
                      {modelOption}
                    </option>
                  ))}
                </select>
              ) : nhtsaModels.length > 0 ? (
                <select value={formState.model} onChange={(event) => updateField("model", event.target.value)} required>
                  <option value="" disabled>
                    Select model
                  </option>
                  {nhtsaModels.map((modelOption) => (
                    <option key={modelOption} value={modelOption}>
                      {modelOption}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  {(brandSource === "nhtsa" || brandSource === "other") && formState.brand ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ marginBottom: "8px" }}
                      disabled={loadingNhtsaModels}
                      onClick={() => {
                        void onFetchModels();
                      }}
                    >
                      {loadingNhtsaModels ? "Loading models..." : "Fetch models"}
                    </button>
                  ) : null}

                  {nhtsaFetched ? (
                    <input
                      type="text"
                      value={formState.model}
                      onChange={(event) => updateField("model", event.target.value)}
                      placeholder="Enter model"
                      required
                    />
                  ) : (
                    <input type="text" value={formState.model} placeholder="Select brand first" disabled required />
                  )}
                </>
              )}
            </label>

            <label>
              Year
              <select value={formState.year} onChange={(event) => updateField("year", event.target.value)} required>
                <option value="" disabled>
                  Select year
                </option>
                {YEARS.map((yearOption) => (
                  <option key={yearOption} value={String(yearOption)}>
                    {yearOption}
                  </option>
                ))}
              </select>
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
              Region Spec
              <select value={formState.regionSpec} onChange={(event) => updateField("regionSpec", event.target.value)} required>
                <option value="" disabled>
                  Select region spec
                </option>
                {REGION_SPECS.map((regionSpec) => (
                  <option key={regionSpec} value={regionSpec}>
                    {regionSpec}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Body Type
              <select value={formState.bodyType} onChange={(event) => updateField("bodyType", event.target.value)} required>
                <option value="" disabled>
                  Select body type
                </option>
                {BODY_TYPES.map((bodyType) => (
                  <option key={bodyType} value={bodyType}>
                    {bodyType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fuel Type
              <select value={formState.fuelType} onChange={(event) => updateField("fuelType", event.target.value)} required>
                <option value="" disabled>
                  Select fuel type
                </option>
                {FUEL_TYPES.map((fuelType) => (
                  <option key={fuelType} value={fuelType}>
                    {fuelType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Transmission
              <select
                value={formState.transmission}
                onChange={(event) => updateField("transmission", event.target.value)}
                required
              >
                <option value="" disabled>
                  Select transmission
                </option>
                {TRANSMISSION_TYPES.map((transmission) => (
                  <option key={transmission} value={transmission}>
                    {transmission}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Mileage km
              <input
                type="number"
                min={0}
                value={formState.mileageKm}
                onChange={(event) => updateField("mileageKm", event.target.value)}
                required
              />
            </label>

            <label>
              Color
              <select value={formState.color} onChange={(event) => updateField("color", event.target.value)} required>
                <option value="" disabled>
                  Select color
                </option>
                {COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Condition
              <select value={formState.condition} onChange={(event) => updateField("condition", event.target.value)} required>
                <option value="" disabled>
                  Select condition
                </option>
                {CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Service History
              <select
                value={formState.serviceHistory}
                onChange={(event) => updateField("serviceHistory", event.target.value)}
                required
              >
                <option value="" disabled>
                  Select service history
                </option>
                {SERVICE_HISTORY_OPTIONS.map((serviceHistory) => (
                  <option key={serviceHistory} value={serviceHistory}>
                    {serviceHistory}
                  </option>
                ))}
              </select>
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

            <label className="seller-form-full">
              Seller Notes
              <textarea
                rows={3}
                placeholder="Additional notes for buyers..."
                value={formState.sellerNotes}
                onChange={(event) => updateField("sellerNotes", event.target.value)}
              />
            </label>

            <div className="seller-form-actions seller-form-full">
              <button type="submit" className="button button-primary" disabled={formSubmitting}>
                {formSubmitting ? "Saving..." : "Create Vehicle + Auction Draft"}
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

          {formNotice ? (
            <p className="inline-note tone-success" style={{ marginTop: "12px" }}>
              {formNotice}
            </p>
          ) : null}
          {formError ? (
            <p className="inline-note tone-error" style={{ marginTop: "12px" }}>
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
