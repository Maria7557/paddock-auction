"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getToken } from "@/src/lib/auth_client";

type WishlistItem = {
  id: string;
  auctionId: string;
  savedAt: string;
  auction: {
    id: string;
    state: string;
    currentPrice: number;
    endsAt: string;
    vehicle: { brand: string; model: string; year: number; mileage: number } | null;
  };
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch("/api/buyer/wishlist", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { items?: WishlistItem[] }) => {
        setItems(data.items ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function remove(auctionId: string) {
    const token = getToken();
    await fetch(`/api/buyer/wishlist/${auctionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token ?? ""}` },
    });
    setItems((prev) => prev.filter((i) => i.auctionId !== auctionId));
  }

  if (loading) return <div style={{ padding: 40 }}>Loading wishlist…</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>My Wishlist</h1>
      {items.length === 0 ? (
        <div style={{ color: "#666", textAlign: "center", padding: "60px 0" }}>
          <p style={{ fontSize: 18, marginBottom: 16 }}>No saved lots yet.</p>
          <Link href="/auctions" style={{ color: "#116a43", fontWeight: 600 }}>
            Browse Auctions →
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>
                  {item.auction.vehicle
                    ? `${item.auction.vehicle.year} ${item.auction.vehicle.brand} ${item.auction.vehicle.model}`
                    : "Unknown Vehicle"}
                </div>
                <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
                  {item.auction.vehicle?.mileage?.toLocaleString()} KM ·{" "}
                  <span
                    style={{
                      color: item.auction.state === "LIVE" ? "#116a43" : "#666",
                      fontWeight: item.auction.state === "LIVE" ? 600 : 400,
                    }}
                  >
                    {item.auction.state}
                  </span>{" "}
                  · AED {item.auction.currentPrice.toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Link
                  href={`/auctions/${item.auctionId}`}
                  style={{
                    padding: "8px 20px",
                    background: "#116a43",
                    color: "#fff",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  View Lot
                </Link>
                <button
                  onClick={() => void remove(item.auctionId)}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "#666",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
