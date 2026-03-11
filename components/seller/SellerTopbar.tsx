"use client";

type SellerTopbarProps = {
  companyName: string;
  companyStatus: string;
  onToggleSidebar: () => void;
};

function statusLabel(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized.includes("PENDING")) {
    return "PENDING";
  }

  return normalized;
}

export function SellerTopbar({ companyName, companyStatus, onToggleSidebar }: SellerTopbarProps) {
  const label = statusLabel(companyStatus);

  return (
    <header className="seller-topbar">
      <div className="seller-topbar-left">
        <button
          type="button"
          className="seller-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle seller menu"
        >
          ☰
        </button>
        <h1 className="seller-company-name">{companyName}</h1>
      </div>

      <div className="seller-topbar-actions">
        <span className="seller-active-badge">{label}</span>
        <button
          type="button"
          className="seller-logout-btn"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("fleetbid_token");
              window.localStorage.removeItem("fleetbid_role");
              document.cookie = "token=; Max-Age=0; Path=/; SameSite=Lax";
              window.location.href = "/login";
            }
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
