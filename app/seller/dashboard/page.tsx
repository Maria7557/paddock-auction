"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

function statusClass(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === "ACTIVE") {
    return "admin-status-badge admin-status-good";
  }

  if (normalized.includes("PENDING")) {
    return "admin-status-badge admin-status-warn";
  }

  return "admin-status-badge admin-status-bad";
}

export default function SellerDashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<SellerDashboardResponse | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem("fleetbid_token"));
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadDashboard(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/seller/dashboard", {
          headers: {
            authorization: `Bearer ${token}`,
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

        if (!isCancelled) {
          setDashboard(payload as SellerDashboardResponse);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError instanceof Error ? requestError.message : "Unexpected error");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  const companyStatus = useMemo(() => {
    if (!dashboard) {
      return null;
    }

    return dashboard.company.status;
  }, [dashboard]);

  return (
    <section className="market-shell">
      <div className="section-block compact">
        <h1>Welcome, Seller</h1>
        <p className="text-muted">Manage listings, auction activity, and approval status.</p>
      </div>

      {!token ? (
        <div className="surface-panel">
          <p className="text-muted">Session not found. Please sign in again.</p>
          <Link href="/login/seller" className="button button-primary">
            Go to Seller Login
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="surface-panel">
          <p className="text-muted">Loading seller dashboard...</p>
        </div>
      ) : null}

      {error ? (
        <div className="surface-panel">
          <p className="inline-note tone-error">{error}</p>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <div className="surface-panel">
            <div className="inline-actions">
              <p className="text-muted">Company: {dashboard.company.name}</p>
              <span className={statusClass(companyStatus ?? "UNKNOWN")}>{companyStatus}</span>
            </div>

            {dashboard.company.pendingApproval ? (
              <p className="inline-note tone-warning" style={{ marginTop: "12px" }}>
                Your company is under review.
              </p>
            ) : null}

            <div className="inline-actions" style={{ marginTop: "14px" }}>
              <Link href="/seller/dashboard#add-vehicle" className="button button-primary">
                Add Vehicle
              </Link>
              <Link href="/seller/dashboard#my-vehicles" className="button button-secondary">
                My Vehicles
              </Link>
              <Link href="/auctions" className="button button-secondary">
                My Auctions
              </Link>
            </div>
          </div>

          <div className="dashboard-grid">
            <article className="metric-tile">
              <p>Total vehicles</p>
              <strong>{dashboard.stats.vehicles.total}</strong>
            </article>
            <article className="metric-tile">
              <p>Vehicles in active auctions</p>
              <strong>{dashboard.stats.vehicles.withActiveAuction}</strong>
            </article>
            <article className="metric-tile">
              <p>Live auctions</p>
              <strong>{dashboard.stats.auctions.live}</strong>
            </article>
            <article className="metric-tile">
              <p>Payment pending auctions</p>
              <strong>{dashboard.stats.auctions.paymentPending}</strong>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
