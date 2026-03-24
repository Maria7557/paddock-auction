/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { IconArrowRight, IconCalendar, IconClock, IconTag } from "@/components/ui/icons";
import { formatAed } from "@/src/lib/utils";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";
import type {
  EndedBidItem,
  LiveBidItem,
  MyBidAuctionStatus,
  ScheduledBidItem,
  WonPendingItem,
} from "@/src/types/auction";

import styles from "@/app/my-bids/page.module.css";

type BidWatchCardProps =
  | {
      mode: "live";
      item: LiveBidItem;
    }
  | {
      mode: "scheduled";
      item: ScheduledBidItem;
    }
  | {
      mode: "won-pending";
      item: WonPendingItem;
    }
  | {
      mode: "ended";
      item: EndedBidItem;
    };

function normalizeStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();

  switch (normalized) {
    case "LIVE":
      return "LIVE";
    case "EXTENDED":
      return "EXTENDED";
    case "SCHEDULED":
      return "SCHEDULED";
    case "AWAITING_SELLER_DECISION":
      return "AWAITING SELLER DECISION";
    case "PAYMENT_PENDING":
      return "PAYMENT PENDING";
    case "DEFAULTED":
      return "DEFAULTED";
    case "CANCELED":
      return "CANCELED";
    case "RELISTED":
      return "RELISTED";
    case "PAID":
      return "PAID";
    case "CLOSED":
      return "CLOSED";
    default:
      return "ENDED";
  }
}

function getBadgeTone(status: string): BadgeTone {
  const normalized = status.trim().toUpperCase();

  if (normalized === "LIVE" || normalized === "EXTENDED") {
    return "live";
  }

  if (normalized === "SCHEDULED") {
    return "scheduled";
  }

  if (normalized === "PAYMENT_PENDING" || normalized === "AWAITING_SELLER_DECISION") {
    return "payment_pending";
  }

  if (normalized === "DEFAULTED" || normalized === "CANCELED") {
    return "defaulted";
  }

  return "ended";
}

function AuctionStatusBadge({ status }: { status: MyBidAuctionStatus | string }) {
  return <Badge tone={getBadgeTone(status)}>{normalizeStatusLabel(status)}</Badge>;
}

function formatDateTimeLabel(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function CardImage({
  title,
  imageUrl,
  ended = false,
}: {
  title: string;
  imageUrl: string | null;
  ended?: boolean;
}) {
  return (
    <div className={styles.cardImageFrame}>
      <img
        src={imageUrl ?? "/vehicle-photo.svg"}
        alt={title}
        className={`${styles.cardImage} ${ended ? styles.cardImageEnded : ""}`}
      />
      {!imageUrl ? (
        <div className={styles.cardImageFallback} aria-hidden="true">
          <IconTag size={18} strokeWidth={2} />
          <span>No photo</span>
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.metaCopy}>
        <span className={styles.metaLabel}>{label}</span>
        <span className={styles.metaValue}>{value}</span>
      </div>
    </div>
  );
}

export function BidWatchCard({ mode, item }: BidWatchCardProps) {
  const router = useRouter();

  if (mode === "live") {
    return (
      <article className={styles.bidCard}>
        <CardImage title={item.lotTitle} imageUrl={item.imageUrl} />

        <div className={styles.cardBody}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{item.lotTitle}</h3>

            <div className={styles.badgeRow}>
              <AuctionStatusBadge status={item.auctionStatus} />
              <span
                className={`${styles.statePill} ${
                  item.isLeading ? styles.leadingPill : styles.outbidPill
                }`}
              >
                {item.isLeading ? "Leading" : "Outbid"}
              </span>
            </div>
          </div>

          <div className={styles.metaList}>
            <MetaRow
              icon={<IconTag size={16} strokeWidth={2} />}
              label="My Bid"
              value={formatAed(item.myBidAmount)}
            />
            <MetaRow
              icon={<IconTag size={16} strokeWidth={2} />}
              label="Current"
              value={formatAed(item.currentHighestBid)}
            />
            <MetaRow
              icon={<IconClock size={16} strokeWidth={2} />}
              label="Ends In"
              value={<LiveCountdown targetIso={item.auctionEndIso} className={styles.countdown} />}
            />
          </div>

          {!item.isLeading ? (
            <div className={styles.cardFooter}>
              <button
                type="button"
                className={`btn btn-primary ${styles.actionButton}`}
                onClick={() => router.push(`/auctions/${item.auctionId}`)}
              >
                Raise Bid
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  if (mode === "scheduled") {
    return (
      <article className={styles.bidCard}>
        <CardImage title={item.lotTitle} imageUrl={item.imageUrl} />

        <div className={styles.cardBody}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{item.lotTitle}</h3>

            <div className={styles.badgeRow}>
              <AuctionStatusBadge status="SCHEDULED" />
              <span
                className={`${styles.statePill} ${
                  item.isLeading ? styles.leadingPill : styles.outbidPill
                }`}
              >
                {item.isLeading ? "Leading" : "Outbid"}
              </span>
            </div>
          </div>

          <div className={styles.metaList}>
            <MetaRow
              icon={<IconTag size={16} strokeWidth={2} />}
              label="Pre-Bid"
              value={formatAed(item.myBidAmount)}
            />
            <MetaRow
              icon={<IconCalendar size={16} strokeWidth={2} />}
              label="Opens"
              value={formatDateTimeLabel(item.auctionStartIso)}
            />
          </div>

          {!item.isLeading ? (
            <div className={styles.cardFooter}>
              <button
                type="button"
                className={`btn btn-primary ${styles.actionButton}`}
                onClick={() => router.push(`/auctions/${item.auctionId}`)}
              >
                Raise Bid
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  if (mode === "won-pending") {
    return (
      <article className={styles.bidCard}>
        <CardImage title={item.lotTitle} imageUrl={item.imageUrl} />

        <div className={styles.cardBody}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{item.lotTitle}</h3>

            <div className={styles.badgeRow}>
              <span className={`${styles.statePill} ${styles.wonBadge}`}>You Won 🏆</span>
              <span className={`${styles.statePill} ${styles.awaitingBadge}`}>
                Awaiting Seller Decision
              </span>
            </div>
          </div>

          <div className={styles.metaList}>
            <MetaRow
              icon={<IconTag size={16} strokeWidth={2} />}
              label="Winning Bid"
              value={formatAed(item.myBidAmount)}
            />
            <MetaRow
              icon={<IconClock size={16} strokeWidth={2} />}
              label="Seller Timeline"
              value={
                <LiveCountdown
                  targetIso={item.sellerDecisionDeadlineIso}
                  prefix="Seller decides in"
                  className={styles.countdown}
                />
              }
            />
          </div>

          <div className={styles.cardFooter}>
            <Link href={`/auctions/${item.auctionId}`} className={styles.inlineLink}>
              <span>View Lot</span>
              <IconArrowRight size={16} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={styles.bidCard}>
      <CardImage title={item.lotTitle} imageUrl={item.imageUrl} ended />

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{item.lotTitle}</h3>

          <div className={styles.badgeRow}>
            <AuctionStatusBadge status={item.auctionStatus} />
            <span className={`${styles.statePill} ${styles.endedPill}`}>Not Won</span>
          </div>
        </div>

        <div className={styles.metaList}>
          <MetaRow
            icon={<IconTag size={16} strokeWidth={2} />}
            label="My Bid"
            value={formatAed(item.myBidAmount)}
          />
        </div>
      </div>
    </article>
  );
}
