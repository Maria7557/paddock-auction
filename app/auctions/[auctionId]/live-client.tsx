"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/src/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────

type LiveState = {
  auctionId: string;
  state: "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED" | "PAYMENT_PENDING";
  currentPrice: number;
  minIncrement: number;
  nextBidAmount: number;
  endsAt: string;
  lastBidder: {
    emirate: string;
    companyName: string;
    amount: number;
    placedAt: string;
  } | null;
  participantsByEmirate: Array<{ emirate: string; count: number }>;
  totalParticipants: number;
  winnerId: string | null;
  isWinner: boolean;
};

type VehicleSpec = {
  brand: string;
  model: string;
  year: number;
  mileage: number;
  regionSpec?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  color?: string | null;
  condition?: string | null;
  description?: string | null;
};

type LiveClientProps = {
  auctionId: string;
  vehicle: VehicleSpec;
  images: string[];
  initialState: LiveState;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString("en-AE")}`;
}

function useCountdown(endsAt: string): string {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    function tick() {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setDisplay(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return display;
}

// ── Gallery ────────────────────────────────────────────────────────────────

function PhotoGallery({ images, title }: { images: string[]; title: string }) {
  const [current, setCurrent] = useState(0);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAuto = useCallback(() => {
    if (images.length <= 1) return;
    autoRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 5000);
  }, [images.length]);

  useEffect(() => {
    startAuto();
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [startAuto]);

  function stopAuto() {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
  }

  function prev() {
    stopAuto();
    setCurrent((c) => (c - 1 + images.length) % images.length);
  }

  function next() {
    stopAuto();
    setCurrent((c) => (c + 1) % images.length);
  }

  if (images.length === 0) {
    return (
      <div className="gallery-main gallery-placeholder">
        <span style={{ fontSize: "64px" }}>🚗</span>
        <p style={{ color: "var(--ink-muted)", marginTop: "12px" }}>No photos available</p>
      </div>
    );
  }

  return (
    <div className="gallery-wrap">
      <div className="gallery-main">
        <img src={images[current]} alt={`${title} photo ${current + 1}`} className="gallery-img" />
        {images.length > 1 && (
          <>
            <button className="gallery-nav gallery-prev" onClick={prev} aria-label="Previous">
              ‹
            </button>
            <button className="gallery-nav gallery-next" onClick={next} aria-label="Next">
              ›
            </button>
            <span className="gallery-counter">
              {current + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.slice(0, 8).map((src, i) => (
            <button
              key={i}
              className={`gallery-thumb${i === current ? " active" : ""}`}
              onClick={() => {
                stopAuto();
                setCurrent(i);
              }}
            >
              <img src={src} alt={`thumb ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Win Screen ─────────────────────────────────────────────────────────────

function WinScreen({ vehicle, finalPrice }: { vehicle: VehicleSpec; finalPrice: number }) {
  return (
    <div className="win-screen">
      <div className="confetti-container">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              backgroundColor: ["#116a43", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6"][i % 5],
            }}
          />
        ))}
      </div>
      <div className="win-content">
        <div className="win-emoji">🏆</div>
        <h1 className="win-title">CONGRATULATIONS!</h1>
        <p className="win-subtitle">You won this auction!</p>
        <p className="win-vehicle">
          {vehicle.year} {vehicle.brand} {vehicle.model}
        </p>
        <div className="win-price">{formatAed(finalPrice)}</div>
        <a
          href="/invoices"
          className="button button-primary"
          style={{ marginTop: "24px", display: "inline-block", fontSize: "18px", padding: "14px 32px" }}
        >
          Pay Now →
        </a>
      </div>
    </div>
  );
}

// ── Bid Panel ──────────────────────────────────────────────────────────────

function BidPanel({
  live,
  auctionId,
  onBidSuccess,
}: {
  live: LiveState;
  auctionId: string;
  onBidSuccess: () => void;
}) {
  const countdown = useCountdown(live.endsAt);
  const [bidding, setBidding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justBid, setJustBid] = useState(false);

  async function placeBid() {
    setBidding(true);
    setError(null);

    try {
      const idempotencyKey = `bid-${auctionId}-${live.nextBidAmount}-${Date.now()}`;
      await api.bids.place(auctionId, live.nextBidAmount, idempotencyKey);

      setJustBid(true);
      setTimeout(() => setJustBid(false), 2000);
      onBidSuccess();
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        setError("Please log in to bid");
      } else if (error instanceof Error && error.message.trim()) {
        setError(error.message);
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setBidding(false);
    }
  }

  const isLive = live.state === "LIVE";
  const isScheduled = live.state === "SCHEDULED";
  const isClosed = live.state === "CLOSED" || live.state === "CANCELLED";

  return (
    <div className="live-bid-panel">
      {/* Status + Timer */}
      <div className="live-header">
        {isLive && (
          <span className="live-status-badge">
            <span className="live-dot" />LIVE
          </span>
        )}
        {isScheduled && <span className="scheduled-badge">SCHEDULED</span>}
        {isClosed && <span className="ended-badge">ENDED</span>}
        <span className="live-timer">{countdown}</span>
      </div>

      {/* Current Price */}
      <div className="live-price-block">
        <p className="live-price-label">Current Bid</p>
        <p className="live-price">{formatAed(live.currentPrice)}</p>
        {live.lastBidder && (
          <p className="live-last-bidder">
            🇦🇪 {live.lastBidder.emirate} • {live.lastBidder.companyName}
          </p>
        )}
        {!live.lastBidder && (
          <p className="live-last-bidder" style={{ color: "var(--ink-muted)" }}>
            No bids yet — be the first!
          </p>
        )}
      </div>

      {/* Bid Button */}
      {isLive && (
        <div className="live-bid-action">
          <p className="live-next-label">Your next bid</p>
          <p className="live-next-amount">{formatAed(live.nextBidAmount)}</p>
          <button className={`button live-bid-btn${justBid ? " just-bid" : ""}`} onClick={() => void placeBid()} disabled={bidding}>
            {bidding ? "Placing bid..." : justBid ? "✓ Bid placed!" : `BID — ${formatAed(live.nextBidAmount)}`}
          </button>
          {error && <p className="live-bid-error">{error}</p>}
        </div>
      )}

      {isScheduled && (
        <div className="live-bid-action">
          <p style={{ color: "var(--ink-muted)", textAlign: "center" }}>Auction hasn't started yet</p>
          <p style={{ color: "var(--ink-muted)", textAlign: "center", fontSize: "14px" }}>
            Starting price: {formatAed(live.currentPrice || live.nextBidAmount)}
          </p>
        </div>
      )}

      {isClosed && !live.isWinner && (
        <div className="live-bid-action">
          <p style={{ color: "var(--ink-muted)", textAlign: "center" }}>Auction has ended</p>
          {live.currentPrice > 0 && <p style={{ fontWeight: 600, textAlign: "center" }}>Winning bid: {formatAed(live.currentPrice)}</p>}
          <a href="/auctions" className="button button-secondary" style={{ display: "block", textAlign: "center", marginTop: "12px" }}>
            Browse More Lots →
          </a>
        </div>
      )}

      {/* Divider */}
      <div className="live-divider" />

      {/* Participants */}
      <div className="participants-block">
        <p className="participants-title">
          👥 {live.totalParticipants} Participant{live.totalParticipants !== 1 ? "s" : ""}
        </p>
        {live.participantsByEmirate.length > 0 ? (
          <ul className="participants-list">
            {live.participantsByEmirate.map(({ emirate, count }) => (
              <li key={emirate} className="participant-row">
                <span className="participant-emirate">🇦🇪 {emirate}</span>
                <span className="participant-count">{count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--ink-muted)", fontSize: "14px" }}>No participants yet</p>
        )}
      </div>
    </div>
  );
}

// ── Vehicle Specs ──────────────────────────────────────────────────────────

function VehicleSpecs({ vehicle }: { vehicle: VehicleSpec }) {
  const specs = [
    { label: "Year", value: vehicle.year },
    { label: "Mileage", value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} km` : null },
    { label: "Region", value: vehicle.regionSpec },
    { label: "Fuel", value: vehicle.fuelType },
    { label: "Transmission", value: vehicle.transmission },
    { label: "Body Type", value: vehicle.bodyType },
    { label: "Color", value: vehicle.color },
    { label: "Condition", value: vehicle.condition },
  ].filter((s) => s.value != null);

  return (
    <div className="vehicle-specs-block">
      <h2 style={{ marginBottom: "16px" }}>
        {vehicle.year} {vehicle.brand} {vehicle.model}
      </h2>
      <div className="specs-grid">
        {specs.map(({ label, value }) => (
          <div key={label} className="spec-item">
            <span className="spec-label">{label}</span>
            <span className="spec-value">{String(value)}</span>
          </div>
        ))}
      </div>
      {vehicle.description && (
        <div className="spec-description">
          <p className="spec-label" style={{ marginBottom: "6px" }}>
            Description
          </p>
          <p>{vehicle.description}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function LiveClient({ auctionId, vehicle, images, initialState }: LiveClientProps) {
  const [live, setLive] = useState<LiveState>(initialState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await api.auctions.liveState<LiveState>(auctionId, {
        cache: "no-store",
      });
      setLive(data);

      // Stop polling when auction is over
      if (data.state === "CLOSED" || data.state === "CANCELLED") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // silently ignore network errors during polling
    }
  }, [auctionId]);

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [poll]);

  // WIN SCREEN
  if (live.isWinner) {
    return <WinScreen vehicle={vehicle} finalPrice={live.currentPrice} />;
  }

  return (
    <div className="live-auction-layout">
      {/* LEFT — Gallery */}
      <div className="live-gallery-col">
        <PhotoGallery images={images} title={`${vehicle.year} ${vehicle.brand} ${vehicle.model}`} />
      </div>

      {/* CENTER — Specs */}
      <div className="live-specs-col">
        <VehicleSpecs vehicle={vehicle} />
      </div>

      {/* RIGHT — Bid Panel */}
      <div className="live-panel-col">
        <BidPanel
          live={live}
          auctionId={auctionId}
          onBidSuccess={() => {
            void poll();
          }}
        />
      </div>
    </div>
  );
}
