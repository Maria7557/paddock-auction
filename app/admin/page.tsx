"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken, logout } from "@/src/lib/auth_client";

type AdminTab = "companies" | "kyc" | "returns" | "blocked";

type PendingCompany = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  companyUsers: Array<{
    id: string;
    userId: string;
    userEmail: string;
    role: string;
    userStatus: string;
  }>;
};

type PendingUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  kycVerified?: boolean;
  createdAt: string;
};

type PendingReturn = {
  ledgerId: string;
  walletId: string;
  userId: string;
  email: string;
  amount: number;
  reference: string | null;
  createdAt: string;
};

type ApiEnvelope<T> = {
  error?: string;
  message?: string;
  companies?: T;
  users?: T;
  returns?: T;
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

function statusBadgeClass(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized.includes("ACTIVE") || normalized.includes("APPROVED")) {
    return "admin-status-badge admin-status-good";
  }

  if (normalized.includes("PENDING")) {
    return "admin-status-badge admin-status-warn";
  }

  if (normalized.includes("BLOCKED") || normalized.includes("BURNED") || normalized.includes("REJECTED")) {
    return "admin-status-badge admin-status-bad";
  }

  return "admin-status-badge";
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("companies");
  const [token, setToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [companies, setCompanies] = useState<PendingCompany[]>([]);
  const [kycUsers, setKycUsers] = useState<PendingUser[]>([]);
  const [returns, setReturns] = useState<PendingReturn[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<PendingUser[]>([]);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (!token) {
      throw new Error("Missing auth token in localStorage");
    }

    const headers = new Headers(init.headers ?? undefined);
    headers.set("authorization", `Bearer ${token}`);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return fetch(path, {
      ...init,
      headers,
    });
  }

  async function readJson<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  const loadCompanies = useCallback(async () => {
    const response = await authorizedFetch("/api/admin/companies/pending");
    const payload = await readJson<ApiEnvelope<PendingCompany[]>>(response);

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to load pending companies");
    }

    setCompanies(payload?.companies ?? []);
  }, [token]);

  const loadPendingKyc = useCallback(async () => {
    const response = await authorizedFetch("/api/admin/users/pending?status=PENDING_KYC");
    const payload = await readJson<ApiEnvelope<PendingUser[]>>(response);

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to load pending KYC users");
    }

    setKycUsers(payload?.users ?? []);
  }, [token]);

  const loadDepositReturns = useCallback(async () => {
    const response = await authorizedFetch("/api/admin/deposits/pending-returns");
    const payload = await readJson<ApiEnvelope<PendingReturn[]>>(response);

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to load pending deposit returns");
    }

    setReturns(payload?.returns ?? []);
  }, [token]);

  const loadBlockedUsers = useCallback(async () => {
    const response = await authorizedFetch("/api/admin/users/pending?status=BLOCKED");
    const payload = await readJson<ApiEnvelope<PendingUser[]>>(response);

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to load blocked users");
    }

    setBlockedUsers(payload?.users ?? []);
  }, [token]);

  const refreshActiveTab = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (activeTab === "companies") {
        await loadCompanies();
      }

      if (activeTab === "kyc") {
        await loadPendingKyc();
      }

      if (activeTab === "returns") {
        await loadDepositReturns();
      }

      if (activeTab === "blocked") {
        await loadBlockedUsers();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unexpected load error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, token, loadCompanies, loadPendingKyc, loadDepositReturns, loadBlockedUsers]);

  useEffect(() => {
    refreshActiveTab();
  }, [refreshActiveTab]);

  async function runAction(
    request: () => Promise<Response>,
    successMessage: string,
  ): Promise<void> {
    setNotice(null);
    setError(null);

    try {
      const response = await request();
      const payload = await readJson<Record<string, unknown> & { error?: string; message?: string }>(response);

      if (!response.ok) {
        throw new Error((payload?.message as string | undefined) ?? payload?.error ?? "Request failed");
      }

      setNotice(successMessage);
      await refreshActiveTab();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    }
  }

  const tabButtons = useMemo(
    () => [
      { id: "companies" as const, label: "Pending Companies" },
      { id: "kyc" as const, label: "Pending KYC" },
      { id: "returns" as const, label: "Deposit Returns" },
      { id: "blocked" as const, label: "Blocked Users" },
    ],
    [],
  );

  return (
    <section className="admin-dashboard">
      <header className="surface-panel admin-header">
        <div>
          <h1>FleetBid Admin</h1>
          <p>Logged in as admin@fleetbid.ae</p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          style={{ borderColor: "#f0ccca", color: "var(--red-600)", minHeight: "40px", padding: "8px 14px" }}
          onClick={logout}
        >
          Logout
        </button>
      </header>

      <div className="surface-panel">
        <div className="tab-row" role="tablist" aria-label="Admin sections">
          {tabButtons.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "is-active" : undefined}
              onClick={() => {
                setActiveTab(tab.id);
                setNotice(null);
                setError(null);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {notice ? <p className="inline-note tone-success admin-feedback">{notice}</p> : null}
        {error ? <p className="inline-note tone-error admin-feedback">{error}</p> : null}
        {loading ? <p className="text-muted admin-feedback">Loading data...</p> : null}

        {!loading && activeTab === "companies" ? (
          <div id="companies" className="tab-content">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Email</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>{company.name}</td>
                    <td>{company.companyUsers[0]?.userEmail ?? "—"}</td>
                    <td>{formatDate(company.createdAt)}</td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() =>
                            runAction(
                              () => authorizedFetch(`/api/admin/companies/${company.id}/approve`, { method: "POST" }),
                              `Company ${company.name} approved`,
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="button admin-button-danger"
                          onClick={() => {
                            const reason = window.prompt("Reject reason:", "Incomplete company documents");

                            if (!reason || reason.trim().length === 0) {
                              return;
                            }

                            void runAction(
                              () =>
                                authorizedFetch(`/api/admin/companies/${company.id}/reject`, {
                                  method: "POST",
                                  body: JSON.stringify({ reason: reason.trim() }),
                                }),
                              `Company ${company.name} rejected`,
                            );
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-cell">
                      No pending companies.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && activeTab === "kyc" ? (
          <div id="users" className="tab-content">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Registered</th>
                  <th>KYC Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {kycUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <span className={statusBadgeClass(user.kycVerified ? "ACTIVE" : "PENDING")}> 
                        {user.kycVerified ? "ACTIVE" : "PENDING"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() =>
                          runAction(
                            () => authorizedFetch(`/api/admin/users/${user.id}/approve-kyc`, { method: "POST" }),
                            `KYC approved for ${user.email}`,
                          )
                        }
                      >
                        Approve KYC
                      </button>
                    </td>
                  </tr>
                ))}
                {kycUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-cell">
                      No pending KYC users.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && activeTab === "returns" ? (
          <div id="deposits" className="tab-content">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Amount (AED)</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((pendingReturn) => (
                  <tr key={pendingReturn.ledgerId}>
                    <td>{pendingReturn.email}</td>
                    <td>{formatAmountAed(pendingReturn.amount)}</td>
                    <td>{formatDate(pendingReturn.createdAt)}</td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() =>
                            runAction(
                              () =>
                                authorizedFetch(`/api/admin/deposits/${pendingReturn.userId}/approve-return`, {
                                  method: "POST",
                                  body: JSON.stringify({ reason: "Approved by admin" }),
                                }),
                              `Deposit return approved for ${pendingReturn.email}`,
                            )
                          }
                        >
                          Approve Return
                        </button>
                        <button
                          type="button"
                          className="button admin-button-danger"
                          onClick={() => {
                            const auctionId = window.prompt("Auction ID for deposit burn:");

                            if (!auctionId || auctionId.trim().length === 0) {
                              return;
                            }

                            const reason = window.prompt("Burn reason:", "Buyer defaulted payment after deadline");

                            if (!reason || reason.trim().length < 10) {
                              setError("Burn reason must be at least 10 characters.");
                              return;
                            }

                            void runAction(
                              () =>
                                authorizedFetch(`/api/admin/deposits/${pendingReturn.userId}/burn`, {
                                  method: "POST",
                                  body: JSON.stringify({
                                    auctionId: auctionId.trim(),
                                    reason: reason.trim(),
                                  }),
                                }),
                              `Deposit burned for ${pendingReturn.email}`,
                            );
                          }}
                        >
                          Burn Deposit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-cell">
                      No pending deposit returns.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && activeTab === "blocked" ? (
          <div className="tab-content">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blockedUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      <span className={statusBadgeClass(user.status)}>{user.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          const reason = window.prompt("Unblock reason:", "Account review completed");

                          if (!reason || reason.trim().length === 0) {
                            return;
                          }

                          void runAction(
                            () =>
                              authorizedFetch(`/api/admin/users/${user.id}/unblock`, {
                                method: "POST",
                                body: JSON.stringify({ reason: reason.trim() }),
                              }),
                            `User ${user.email} unblocked`,
                          );
                        }}
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
                {blockedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty-cell">
                      No blocked users.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
