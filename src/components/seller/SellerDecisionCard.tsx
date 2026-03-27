/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";

import { IconArrowRight, IconClock, IconTag, IconUsers } from "@/components/ui/icons";
import { formatAed } from "@/src/lib/utils";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";
import type { SellerPendingDecisionItem } from "@/src/types/auction";

import styles from "./SellerDecisionCard.module.css";

export type SellerDecisionCardProps = SellerPendingDecisionItem & {
  onAccept?: (auctionId: string) => void | Promise<void>;
  onDecline?: (auctionId: string) => void | Promise<void>;
  busyAction?: "accept" | "decline" | null;
  detailHref?: string;
};

export function SellerDecisionCard({
  auctionId,
  lotTitle,
  imageUrl,
  winningBidAmount,
  buyerAlias,
  decisionDeadlineIso,
  onAccept,
  onDecline,
  busyAction = null,
  detailHref,
}: SellerDecisionCardProps) {
  const href = detailHref ?? `/seller/auctions/${auctionId}`;

  return (
    <article className={styles.card}>
      <div className={styles.mediaFrame}>
        <img
          src={imageUrl ?? "/vehicle-photo.svg"}
          alt={lotTitle}
          className={styles.image}
        />
        {!imageUrl ? (
          <div className={styles.fallback} aria-hidden="true">
            <IconTag size={18} strokeWidth={2} />
            <span>No photo</span>
          </div>
        ) : null}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <h3 className={styles.title}>{lotTitle}</h3>

          <div className={styles.badgeRow}>
            <span className={`${styles.pill} ${styles.winnerPill}`}>Winning Bid</span>
            <span className={`${styles.pill} ${styles.awaitingPill}`}>Awaiting Seller Decision</span>
          </div>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaRow}>
            <span className={styles.metaIcon} aria-hidden="true">
              <IconTag size={16} strokeWidth={2} />
            </span>
            <div className={styles.metaCopy}>
              <span className={styles.metaLabel}>Winning Bid</span>
              <span className={styles.metaValue}>{formatAed(winningBidAmount)}</span>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span className={styles.metaIcon} aria-hidden="true">
              <IconUsers size={16} strokeWidth={2} />
            </span>
            <div className={styles.metaCopy}>
              <span className={styles.metaLabel}>Top Buyer</span>
              <span className={styles.metaValue}>{buyerAlias}</span>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span className={styles.metaIcon} aria-hidden="true">
              <IconClock size={16} strokeWidth={2} />
            </span>
            <div className={styles.metaCopy}>
              <span className={styles.metaLabel}>Decision Due In</span>
              <span className={styles.metaValue}>
                <LiveCountdown targetIso={decisionDeadlineIso} className={styles.countdown} />
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          {onAccept ? (
            <button
              type="button"
              className={`btn btn-primary ${styles.button}`}
              onClick={() => void onAccept(auctionId)}
              disabled={busyAction !== null}
            >
              {busyAction === "accept" ? "Accepting..." : "Accept Bid"}
            </button>
          ) : null}

          {onDecline ? (
            <button
              type="button"
              className={`btn btn-outline ${styles.button} ${styles.declineButton}`}
              onClick={() => void onDecline(auctionId)}
              disabled={busyAction !== null}
            >
              {busyAction === "decline" ? "Declining..." : "Decline Bid"}
            </button>
          ) : null}

          <Link href={href} className={styles.link}>
            View Auction
            <IconArrowRight size={16} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </article>
  );
}
