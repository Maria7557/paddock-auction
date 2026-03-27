"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatAed } from "@/src/lib/utils";

import styles from "./LotResultOverlay.module.css";

export type LotResultOverlayScenario = "won" | "sold" | "unsold" | "ended";

type VehicleSummary = {
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuelType: string;
  specRegion: string;
};

type EndedStats = {
  totalLots: number;
  soldCount: number;
  lotsWonByUser: number;
  totalBidsByUser: number;
};

type Props = {
  scenario: LotResultOverlayScenario;
  winningPrice: number;
  vehicle: VehicleSummary;
  vehicleImage?: string;
  userBidCount: number;
  countdownSeconds: number;
  onComplete: () => void;
  ctaHref?: string;
  stats?: EndedStats;
};

const CIRCLE_RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const CONFETTI_COLORS = ["#116a43", "#1a8a57", "#e8f4ee", "#c5e0d1", "#9b6914"];

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${styles.icon} ${styles.iconWon}`}>
      <path
        fill="currentColor"
        d="M7 3h10v2h2a1 1 0 0 1 1 1v1a5 5 0 0 1-4 4.9A6.02 6.02 0 0 1 13 16.7V19h4v2H7v-2h4v-2.3a6.02 6.02 0 0 1-3-4.8A5 5 0 0 1 4 7V6a1 1 0 0 1 1-1h2V3Zm0 4H6a3 3 0 0 0 2 2.82V7Zm10 2.82A3 3 0 0 0 18 7h-1v2.82Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20Zm4.3 6.3L10.5 14l-2.8-2.8l-1.4 1.4l4.2 4.2l7.2-7.1l-1.4-1.4Z"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${styles.icon} ${styles.iconUnsold}`}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20Zm1 5h-2v7h2V7Zm0 9h-2v2h2v-2Z"
      />
    </svg>
  );
}

function CarIllustration() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className={styles.vehicleIllustration}>
      <path
        fill="currentColor"
        opacity="0.14"
        d="M17 35h46l5 6H12l5-6Zm6-16h20c6 0 11 1 16 6l5 7H16l3-8c1-3 2-5 4-5Z"
      />
      <path
        fill="currentColor"
        d="M23 22h20c5 0 9 1 14 6l2 3H18l2-5c1-2 1-4 3-4Zm-7 12h48a4 4 0 0 1 4 4v3H12v-3a4 4 0 0 1 4-4Zm9 10a5 5 0 1 1 0-10a5 5 0 0 1 0 10Zm30 0a5 5 0 1 1 0-10a5 5 0 0 1 0 10Z"
      />
    </svg>
  );
}

function CircularCountdown({ seconds, color }: { seconds: number; color: string }) {
  const totalMs = Math.max(1, seconds * 1_000);
  const [remainingMs, setRemainingMs] = useState(totalMs);

  useEffect(() => {
    setRemainingMs(totalMs);

    if (seconds <= 0) {
      return undefined;
    }

    let animationFrame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const nextRemaining = Math.max(0, totalMs - (now - startedAt));
      setRemainingMs(nextRemaining);

      if (nextRemaining > 0) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [seconds, totalMs]);

  const progress = remainingMs / totalMs;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const secondsLabel = Math.max(0, Math.ceil(remainingMs / 1_000));

  return (
    <svg viewBox="0 0 64 64" className={styles.timerSvg} aria-hidden="true">
      <circle cx="32" cy="32" r={CIRCLE_RADIUS} className={styles.timerTrack} />
      <circle
        cx="32"
        cy="32"
        r={CIRCLE_RADIUS}
        className={styles.timerProgress}
        stroke={color}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
      />
      <text x="32" y="34" className={styles.timerValue}>
        {secondsLabel}
      </text>
    </svg>
  );
}

export function LotResultOverlay(props: Props) {
  const { scenario, winningPrice, vehicle, vehicleImage, userBidCount, countdownSeconds, onComplete, ctaHref, stats } = props;
  const [visible, setVisible] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (scenario === "ended" || countdownSeconds <= 0) {
      return undefined;
    }

    completedRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, countdownSeconds * 1_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [countdownSeconds, onComplete, scenario]);

  useEffect(() => {
    if (scenario !== "won") {
      return undefined;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return undefined;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: 90 }, () => ({
      x: rect.width / 2 + (Math.random() - 0.5) * 140,
      y: rect.height * 0.22,
      size: 4 + Math.random() * 7,
      vx: (Math.random() - 0.5) * 5,
      vy: 1 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.25,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));

    let animationFrame = 0;
    const startedAt = performance.now();

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      const alpha = Math.max(0, 1 - elapsed / 2_000);

      ctx.clearRect(0, 0, rect.width, rect.height);

      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;
        particle.vy += 0.03;

        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
        ctx.restore();
      });

      if (elapsed < 2_000) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      ctx.clearRect(0, 0, rect.width, rect.height);
    };
  }, [scenario]);

  const scenarioColor = useMemo(() => {
    switch (scenario) {
      case "won":
      case "ended":
        return "#116a43";
      case "unsold":
        return "#9b6914";
      default:
        return "#556270";
    }
  }, [scenario]);

  const vehicleMeta = [
    vehicle.mileage > 0 ? `${vehicle.mileage.toLocaleString("en-AE")} km` : null,
    vehicle.specRegion && vehicle.specRegion !== "Not specified" ? vehicle.specRegion : null,
    vehicle.fuelType && vehicle.fuelType !== "Not specified" ? vehicle.fuelType : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ""}`}>
      <div className={styles.card}>
        {scenario === "won" ? <canvas ref={canvasRef} className={styles.confettiCanvas} /> : null}

        {scenario === "ended" ? <div className={styles.brandLabel}>FleetBid · Auction complete</div> : null}

        {scenario === "won" ? (
          <div className={`${styles.iconRing} ${styles.iconRingWon}`}>
            <TrophyIcon />
          </div>
        ) : null}
        {scenario === "sold" || scenario === "ended" ? (
          <div className={styles.iconRing}>
            <CheckIcon />
          </div>
        ) : null}
        {scenario === "unsold" ? (
          <div className={`${styles.iconRing} ${styles.iconRingUnsold}`}>
            <WarningIcon />
          </div>
        ) : null}

        {scenario === "won" ? <div className={`${styles.eyebrow} ${styles.eyebrowWon}`}>Lot closed — you won</div> : null}
        {scenario === "sold" ? <div className={styles.eyebrow}>Lot closed</div> : null}
        {scenario === "unsold" ? <div className={`${styles.eyebrow} ${styles.eyebrowUnsold}`}>Time expired</div> : null}

        {scenario === "won" ? <h2 className={styles.title}>Congratulations</h2> : null}
        {scenario === "sold" ? <h2 className={styles.title}>Sold</h2> : null}
        {scenario === "unsold" ? <h2 className={styles.title}>No bids — lot passed</h2> : null}
        {scenario === "ended" ? <h2 className={`${styles.title} ${styles.titleEnded}`}>That&apos;s a wrap.</h2> : null}

        {scenario === "won" ? <div className={styles.amount}>{formatAed(winningPrice)}</div> : null}
        {scenario === "sold" ? <div className={`${styles.amount} ${styles.amountMuted}`}>{formatAed(winningPrice)}</div> : null}

        {scenario === "sold" ? (
          <p className={`${styles.body} ${styles.bodyMuted}`}>
            Another buyer won this lot.
            {userBidCount > 0 ? ` You placed ${userBidCount} bids — great effort.` : ""}
          </p>
        ) : null}

        {scenario === "unsold" ? (
          <p className={`${styles.body} ${styles.bodyMuted}`}>No offers were placed. The seller may relist this vehicle.</p>
        ) : null}

        {scenario === "ended" ? (
          <p className={styles.body}>All lots have been called. Check your results and invoices below.</p>
        ) : null}

        {scenario !== "ended" ? (
          <div className={styles.vehicleCard}>
            <div className={styles.vehicleVisual}>
              {vehicleImage ? <img src={vehicleImage} alt={vehicle.model} className={styles.vehicleImage} /> : <CarIllustration />}
            </div>
            <div className={styles.vehicleContent}>
              <div className={styles.vehicleTitle}>
                {[vehicle.year || null, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
              </div>
              <div className={styles.vehicleMeta}>{vehicleMeta || "Vehicle details unavailable"}</div>
            </div>
          </div>
        ) : null}

        {scenario === "sold" ? <div className={styles.pill}>Better luck on the next lot</div> : null}

        {scenario === "ended" && stats ? (
          <div className={styles.statsGrid}>
            <div className={styles.statsCell}>
              <div className={styles.statsValue}>{stats.totalLots}</div>
              <div className={styles.statsLabel}>Total lots</div>
            </div>
            <div className={styles.statsCell}>
              <div className={styles.statsValue}>{stats.soldCount}</div>
              <div className={styles.statsLabel}>Sold</div>
            </div>
            <div className={styles.statsCell}>
              <div className={styles.statsValue}>{stats.lotsWonByUser}</div>
              <div className={styles.statsLabel}>You won</div>
            </div>
            <div className={styles.statsCell}>
              <div className={styles.statsValue}>{stats.totalBidsByUser}</div>
              <div className={styles.statsLabel}>Your bids</div>
            </div>
          </div>
        ) : null}

        {scenario !== "ended" ? <div className={styles.divider} /> : null}

        {scenario !== "ended" ? (
          <>
            <div className={styles.timerLabel}>Next lot starts in</div>
            <div className={styles.timerWrap}>
              <CircularCountdown seconds={countdownSeconds} color={scenarioColor} />
            </div>
          </>
        ) : null}

        {scenario === "ended" && ctaHref ? (
          <Link href={ctaHref} className={styles.cta}>
            View my results
          </Link>
        ) : null}
      </div>
    </div>
  );
}
