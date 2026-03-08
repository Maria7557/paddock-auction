"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getToken, logout } from "@/src/lib/auth_client";

type SellerVehiclesResponse = {
  vehicles: Array<{
    id: string;
    vin: string;
    brand: string;
    model: string;
    year: number;
    mileage: number;
    latestAuction: {
      id: string;
      state: string;
      startsAt: string;
      endsAt: string;
      currentBid: number;
    } | null;
  }>;
};

function formatAmountAed(value: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

function auctionStateBadge(state: string): { className: string; label: string; pulse: boolean } {
  const normalized = state.toUpperCase();

  if (normalized === "LIVE") {
    return {
      className: "admin-status-badge admin-status-good",
      label: "LIVE",
      pulse: true,
    };
  }

  if (normalized === "SCHEDULED") {
    return {
      className: "admin-status-badge seller-status-scheduled",
      label: "SCHEDULED",
      pulse: false,
    };
  }

  if (normalized === "PAYMENT_PENDING") {
    return {
      className: "admin-status-badge admin-status-warn",
      label: "PAYMENT_PENDING",
      pulse: false,
    };
  }

  if (normalized === "PAID" || normalized === "SOLD") {
    return {
      className: "admin-status-badge admin-status-good",
      label: normalized,
      pulse: false,
    };
  }

  if (normalized === "DRAFT") {
    return {
      className: "admin-status-badge",
      label: "DRAFT",
      pulse: false,
    };
  }

  return {
    className: "admin-status-badge",
    label: normalized,
    pulse: false,
  };
}

export default function SellerVehiclesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SellerVehiclesResponse | null>(null);

  const loadVehicles = useCallback(async (authToken: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/seller/vehicles", {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | SellerVehiclesResponse
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          (payload as { message?: string; error?: string } | null)?.message ??
            (payload as { message?: string; error?: string } | null)?.error ??
            "Failed to load seller vehicles",
        );
      }

      setData(payload as SellerVehiclesResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const authToken = getToken();

    if (!authToken) {
      window.location.href = "/login/seller";
      return;
    }

    setToken(authToken);
    void loadVehicles(authToken);
  }, [loadVehicles]);

  return (
    <section className="market-shell">
      <header className="surface-panel seller-dashboard-header">
        <div>
          <h1>My Vehicles</h1>
          <p className="text-muted">Track vehicle inventory and linked auction states.</p>
        </div>

        <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
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
        <Link href="/seller/dashboard#add-vehicle" className="button button-primary">
          Add Vehicle
        </Link>
      </nav>

      {loading ? (
        <div className="surface-panel">
          <p className="text-muted">Loading vehicles...</p>
        </div>
      ) : null}

      {error ? (
        <div className="surface-panel">
          <p className="inline-note tone-error">{error}</p>
        </div>
      ) : null}

      {data && !loading ? (
        <section className="surface-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>VIN</th>
                <th>Mileage</th>
                <th>Auction State</th>
                <th>Starting Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.vehicles.map((vehicle) => {
                const stateInfo = vehicle.latestAuction
                  ? auctionStateBadge(vehicle.latestAuction.state)
                  : {
                      className: "admin-status-badge",
                      label: "No auction",
                      pulse: false,
                    };

                return (
                  <tr key={vehicle.id}>
                    <td>{`${vehicle.brand} ${vehicle.model} ${vehicle.year}`}</td>
                    <td>{vehicle.vin}</td>
                    <td>{vehicle.mileage.toLocaleString("en-AE")} km</td>
                    <td>
                      <span className={stateInfo.className}>
                        {stateInfo.pulse ? <span className="seller-live-dot" aria-hidden="true" /> : null}
                        {stateInfo.label}
                      </span>
                    </td>
                    <td>{vehicle.latestAuction ? formatAmountAed(vehicle.latestAuction.currentBid) : "-"}</td>
                    <td>
                      {vehicle.latestAuction ? (
                        <Link href={`/auctions/${vehicle.latestAuction.id}`} className="button button-secondary">
                          View
                        </Link>
                      ) : (
                        <button type="button" className="button button-secondary" disabled>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.vehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty-cell">
                    No vehicles available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {!token ? (
        <div className="surface-panel">
          <p className="text-muted">Redirecting to login...</p>
        </div>
      ) : null}
    </section>
  );
}
