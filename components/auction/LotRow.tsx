"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconHeart } from "@/components/ui/icons";
import { withLocalePath } from "@/src/i18n/routing";
import { ApiError, api } from "@/src/lib/api-client";
import type { DisplaySettings } from "@/src/lib/money";
import { formatInteger } from "@/src/lib/money";
import { formatAed } from "@/src/lib/utils";

import styles from "./LotRow.module.css";

type LotRowProps = {
  lot: {
    id: string;
    state: string;
    title: string;
    lotNumber: string;
    vin: string;
    year: number;
    mileageKm: number;
    imageUrl: string;
    imageCount: number;
    currentBidAed: number;
    buyNowPrice?: number | null;
    startsAt: string | null;
    endsAt: string | null;
    conditionGrade: "A" | "B" | "C" | "D";
    primaryDamage: string;
    titleStatus: string;
    tireCondition: number | null;
    engine: string;
    transmission: string;
    driveType: string;
    fuelType: string;
    startCode: string;
    numberOfKeys: number;
    warrantyStatus: string;
    serviceHistory: string;
    vehicle: {
      brand: string;
      model: string;
      regionSpec?: string;
    };
  };
  display: DisplaySettings;
};

function maskVin(vin: string): string {
  const cleanVin = vin.replace(/\s+/g, "");
  return cleanVin.length <= 8 ? `•••${cleanVin}` : `•••${cleanVin.slice(-8)}`;
}

function formatDubaiDate(value: string | null, locale: DisplaySettings["locale"]): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LotRow({ lot, display }: LotRowProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const detailHref = withLocalePath(`/auctions/${lot.id}`, display.locale);
  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const hasBuyNow = typeof lot.buyNowPrice === "number" && lot.buyNowPrice > 0;
  const isServiceHistoryAvailable = lot.serviceHistory.trim().length > 0;

  async function toggleWatchlist(): Promise<void> {
    setSaved((current) => !current);

    try {
      await api.buyer.wishlist.toggle(lot.id);
    } catch (error) {
      setSaved((current) => !current);

      if (error instanceof ApiError && error.statusCode === 401) {
        router.push(withLocalePath("/login", display.locale));
      }
    }
  }

  return (
    <article className={styles.row}>
      <div className={`${styles.cell} ${styles.photoCell}`}>
        <div className={styles.photoWrap}>
          <button
            type="button"
            className={`${styles.bookmarkButton} ${saved ? styles.bookmarkButtonActive : ""}`}
            onClick={() => void toggleWatchlist()}
            aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
            aria-pressed={saved}
          >
            <IconHeart size={15} fill={saved ? "currentColor" : "none"} />
          </button>

          <Image
            src={lot.imageUrl || "/vehicle-photo.svg"}
            alt={lot.title}
            fill
            sizes="160px"
            className={styles.photoImage}
          />

          <span className={styles.photoCount}>{`${lot.imageCount || 1} photos`}</span>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.vehicleCell}`}>
        <Link href={detailHref} className={styles.vehicleTitle}>
          {lot.title}
        </Link>
        <div className={styles.vehicleMetaMono}>
          <span>{`LOT #${lot.lotNumber}`}</span>
          <span>·</span>
          <span>{maskVin(lot.vin)}</span>
        </div>
        <div className={styles.vehicleMeta}>
          {`${formatInteger(lot.mileageKm, display.locale)} KM`}
          {lot.vehicle.regionSpec ? ` · ${lot.vehicle.regionSpec}` : ""}
        </div>
        <div className={styles.badgeRow}>
          <span className={`${styles.badge} ${lot.startCode === "Run & Drive" ? styles.badgeGreen : styles.badgeGray}`}>
            {lot.startCode}
          </span>
          {lot.numberOfKeys > 0 ? (
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{`${lot.numberOfKeys} keys`}</span>
          ) : null}
          {isServiceHistoryAvailable ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Service history</span> : null}
          <span
            className={`${styles.badge} ${
              lot.warrantyStatus === "EXPIRED"
                ? styles.badgeAmber
                : lot.warrantyStatus === "ACTIVE"
                  ? styles.badgeGray
                  : styles.badgeGray
            }`}
          >
            {`Warranty: ${
              lot.warrantyStatus === "ACTIVE" ? "Active" : lot.warrantyStatus === "EXPIRED" ? "Expired" : "None"
            }`}
          </span>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.infoCell}`}>
        <span className={styles.cellLabel}>CONDITION</span>
        <div className={styles.gradeRow}>
          <span
            className={`${styles.gradePill} ${
              lot.conditionGrade === "A"
                ? styles.gradeA
                : lot.conditionGrade === "B"
                  ? styles.gradeB
                  : lot.conditionGrade === "C"
                    ? styles.gradeC
                    : styles.gradeD
            }`}
          >
            {lot.conditionGrade}
          </span>
        </div>
        <div className={styles.metaLine}>
          <span>Damage</span>
          <strong>{lot.primaryDamage || "None"}</strong>
        </div>
        <div className={styles.metaLine}>
          <span>Title</span>
          <strong>{lot.titleStatus || "—"}</strong>
        </div>
        <div className={styles.metaLine}>
          <span>Tyres</span>
          <strong>{lot.tireCondition == null ? "—" : `${lot.tireCondition}%`}</strong>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.infoCell}`}>
        <span className={styles.cellLabel}>DETAILS</span>
        <div className={styles.metaLine}>
          <span>Engine</span>
          <strong>{lot.engine || "—"}</strong>
        </div>
        <div className={styles.metaLine}>
          <span>Trans.</span>
          <strong>{lot.transmission || "—"}</strong>
        </div>
        <div className={styles.metaLine}>
          <span>Fuel</span>
          <strong>{lot.fuelType || "—"}</strong>
        </div>
        <div className={styles.metaLine}>
          <span>Drive</span>
          <strong>{lot.driveType || "—"}</strong>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.statusCell}`}>
        <span className={styles.cellLabel}>AUCTION / STATUS</span>

        {isLive ? (
          <>
            <div className={styles.livePill}>
              <span className={styles.liveDot} aria-hidden />
              LIVE
            </div>
            <Link href={`/auctions/live/${lot.id}`} className={`${styles.statusButton} ${styles.statusButtonLive}`}>
              Enter Live Room
            </Link>
          </>
        ) : (
          <>
            <div className={styles.dateLabel}>{formatDubaiDate(lot.startsAt, display.locale)}</div>
            <div className={styles.timezoneLabel}>Dubai Time</div>
            <div className={styles.currentBidBlock}>
              <span className={styles.currentBidLabel}>CURRENT BID</span>
              <strong className={styles.currentBidValue}>{formatAed(lot.currentBidAed)}</strong>
            </div>
            <Link href={detailHref} className={`${styles.statusButton} ${styles.statusButtonPreBid}`}>
              Pre-Bid
            </Link>
            {hasBuyNow ? (
              <>
                <div className={styles.orDivider}>
                  <span />
                  <em>or</em>
                  <span />
                </div>
                <Link href={detailHref} className={`${styles.statusButton} ${styles.statusButtonBuyNow}`}>
                  {`Buy Now — ${formatAed(lot.buyNowPrice ?? 0)}`}
                </Link>
              </>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
