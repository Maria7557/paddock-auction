"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconPercent, IconClock, IconCalendar, IconArrowRight } from "@/components/ui/icons";
import styles from "./LotCard.module.css";

type LotCardProps = {
  lotId: string;
  title: string;
  year: number;
  mileage: number;
  imageUrl: string;
  currentBid: number;
  status: string;
  endTime: string;
  marketPrice?: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatAed(n: number): string {
  return "AED " + n.toLocaleString("en-US");
}

function savingPct(market: number, current: number): number {
  if (!market || market <= current) return 0;
  return Math.round(((market - current) / market) * 100);
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [cd, setCd] = useState(() => formatCountdown(new Date(endsAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(
      () => setCd(formatCountdown(new Date(endsAt).getTime() - Date.now())),
      1000
    );
    return () => clearInterval(t);
  }, [endsAt]);
  const urgent = cd.hours === 0 && cd.days === 0;
  return (
    <span className={urgent ? styles.urgent : styles.timeVal}>
      {cd.days > 0 ? `${cd.days}d ` : ""}
      {pad(cd.hours)}h {pad(cd.minutes)}m {pad(cd.seconds)}s
    </span>
  );
}

export function LotCard({
  lotId,
  title,
  year,
  mileage,
  imageUrl,
  currentBid,
  status,
  endTime,
  marketPrice,
}: LotCardProps) {
  const isLive = status === "LIVE";
  const saving = marketPrice ? savingPct(marketPrice, currentBid) : 0;

  return (
    <Link href={`/auctions/${lotId}`} className={styles.card}>
      {/* Image */}
      <div className={styles.imgWrap}>
        <Image
          src={imageUrl || "/vehicle-photo.svg"}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          style={{ objectFit: "cover", transition: "transform 0.4s" }}
        />
        <div className={styles.pillTl}>
          {isLive ? (
            <span className="pill pill-live">
              <span className="live-dot" />
              LIVE
            </span>
          ) : (
            <span className="pill pill-sched">Scheduled</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>
          {year} · {mileage.toLocaleString("en-US")} KM
        </div>

        {/* Price comparison strip */}
        <div className={styles.strip}>
          <div className={`${styles.stripCell} ${styles.ours}`}>
            <div className={styles.stripLbl}>FleetBid price</div>
            <div className={styles.stripPrice}>{formatAed(currentBid)}</div>
            {saving > 0 && (
              <div className={styles.saving}>
                <IconPercent size={11} color="var(--green-600)" />
                −{saving}% cheaper
              </div>
            )}
          </div>
          {marketPrice ? (
            <>
              <div className={styles.divider} />
              <div className={styles.stripCell}>
                <div className={styles.stripLbl}>Market price</div>
                <div className={styles.marketPrice}>{formatAed(marketPrice)}</div>
                <div className={styles.otherLbl}>Other listings</div>
              </div>
            </>
          ) : null}
        </div>

        {/* Timing */}
        <div className={styles.timing}>
          {isLive ? (
            <div className={styles.timingLeft}>
              <IconClock size={14} color="var(--ink-secondary)" />
              Ends in&nbsp;
              <LiveCountdown endsAt={endTime} />
            </div>
          ) : (
            <div className={styles.timingLeft}>
              <IconCalendar size={14} color="var(--ink-secondary)" />
              Opens{" "}
              {new Date(endTime).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </div>
          )}
        </div>

        {/* Buy Now CTA */}
        <div className={styles.buyBtn}>
          <div>
            <div className={styles.buyLabel}>{isLive ? "Buy Now from" : "Starting from"}</div>
            <div className={styles.buyPrice}>{formatAed(currentBid)}</div>
          </div>
          <IconArrowRight size={18} color="#fff" />
        </div>
      </div>
    </Link>
  );
}
