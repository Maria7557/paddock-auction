/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuctionStatusBadge } from "@/components/seller/AuctionStatusBadge";
import { formatAed, formatSellerDateTime } from "@/components/seller/utils";
import { IconArrowRight, IconCheck, IconClock } from "@/components/ui/icons";
import { getApiErrorMessage } from "@/src/lib/api-client";
import { LiveCountdown } from "@/src/modules/ui/transport/components/shared/live_countdown";

import styles from "./VehicleListCard.module.css";

type VehicleListAuction = {
  id: string;
  state: string;
  currentPrice: number;
  endsAt: string;
  decisionDeadlineAt: string | null;
};

type VehicleListCardProps = {
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    mileage: number;
    images: string[];
    latestAuction: VehicleListAuction | null;
  };
  onDecision?: (auctionId: string, decision: "accept" | "decline") => Promise<void>;
};

function maskVin(value: string): string {
  if (value.length <= 6) {
    return value;
  }

  return `${value.slice(0, 8)}...`;
}

export function VehicleListCard({ vehicle, onDecision }: VehicleListCardProps) {
  const image = vehicle.images[0] ?? "/vehicle-photo.svg";
  const latestAuction = vehicle.latestAuction;
  const lotTitle = `${vehicle.brand} ${vehicle.model}`.trim();
  const [confirmAction, setConfirmAction] = useState<"accept" | "decline" | null>(null);
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (latestAuction?.state !== "AWAITING_SELLER_DECISION") {
      setConfirmAction(null);
      setBusyAction(null);
      setActionError(null);
    }
  }, [latestAuction?.state]);

  async function handleDecisionConfirm(): Promise<void> {
    if (!latestAuction || !confirmAction || !onDecision) {
      return;
    }

    setBusyAction(confirmAction);
    setActionError(null);

    try {
      await onDecision(latestAuction.id, confirmAction);
      setConfirmAction(null);
    } catch (error) {
      setActionError(getApiErrorMessage(error, "Unable to save your decision right now."));
    } finally {
      setBusyAction(null);
    }
  }

  function renderStatusBadge() {
    if (!latestAuction) {
      return <span className={styles.statusBadge}>No Auction</span>;
    }

    if (latestAuction.state === "AWAITING_SELLER_DECISION") {
      return <span className={`${styles.statusBadge} ${styles.decisionBadge}`}>Decision Required</span>;
    }

    if (latestAuction.state === "PAYMENT_PENDING") {
      return (
        <span className={`${styles.statusBadge} ${styles.soldBadge}`}>
          <IconCheck size={14} strokeWidth={2.5} />
          <span>Sold</span>
        </span>
      );
    }

    if (latestAuction.state === "RELISTED") {
      return <span className={`${styles.statusBadge} ${styles.relistedBadge}`}>Relisted</span>;
    }

    return <AuctionStatusBadge state={latestAuction.state} />;
  }

  function renderStatusBlock() {
    if (!latestAuction) {
      return <p className={styles.statusText}>Create an auction draft</p>;
    }

    if (latestAuction.state === "AWAITING_SELLER_DECISION") {
      return (
        <>
          <p className={styles.statusText}>Winning Bid: {formatAed(latestAuction.currentPrice)}</p>
          <div className={styles.deadlineRow}>
            <span className={styles.deadlineLabel}>
              <IconClock size={14} strokeWidth={2} />
              Decide before:
            </span>
            {latestAuction.decisionDeadlineAt ? (
              <LiveCountdown targetIso={latestAuction.decisionDeadlineAt} className={styles.countdown} />
            ) : (
              <span className={styles.countdownFallback}>—</span>
            )}
          </div>
        </>
      );
    }

    if (latestAuction.state === "PAYMENT_PENDING") {
      return <p className={styles.statusText}>Sold for {formatAed(latestAuction.currentPrice)}</p>;
    }

    if (latestAuction.state === "RELISTED") {
      return <p className={styles.statusText}>Lot will return to the auction queue.</p>;
    }

    return (
      <p className={styles.statusText}>
        {latestAuction.state === "DRAFT"
          ? "Awaiting admin scheduling"
          : `Ends: ${formatSellerDateTime(latestAuction.endsAt)}`}
      </p>
    );
  }

  function renderDecisionActions() {
    if (!latestAuction || latestAuction.state !== "AWAITING_SELLER_DECISION" || !onDecision) {
      return null;
    }

    if (confirmAction) {
      return (
        <div className={styles.confirmationBox}>
          <p className={styles.confirmationText}>
            {confirmAction === "accept"
              ? `Confirm: sell ${lotTitle} for ${formatAed(latestAuction.currentPrice)}? This cannot be undone.`
              : "Decline this bid? Lot will be relisted."}
          </p>

          <div className={styles.confirmationActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.primaryButton}`}
              onClick={() => void handleDecisionConfirm()}
              disabled={busyAction !== null}
            >
              {busyAction === confirmAction ? "Confirming..." : "Confirm"}
            </button>

            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={() => {
                setConfirmAction(null);
                setActionError(null);
              }}
              disabled={busyAction !== null}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.actionStack}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.primaryButton}`}
          onClick={() => {
            setConfirmAction("accept");
            setActionError(null);
          }}
          disabled={busyAction !== null}
        >
          {`Accept - Sell for ${formatAed(latestAuction.currentPrice)}`}
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${styles.declineButton}`}
          onClick={() => {
            setConfirmAction("decline");
            setActionError(null);
          }}
          disabled={busyAction !== null}
        >
          Decline
        </button>
      </div>
    );
  }

  return (
    <article className={styles.card}>
      <div className={styles.main}>
        <img src={image} alt={lotTitle} className={styles.thumb} />

        <div className={styles.copy}>
          <p className={styles.title}>{lotTitle}</p>
          <p className={styles.meta}>
            {vehicle.year} · {formatAed(latestAuction?.currentPrice ?? 0)}
          </p>
          <p className={styles.vin}>VIN: {maskVin(vehicle.vin)}</p>
        </div>
      </div>

      <div className={styles.side}>
        {renderStatusBadge()}
        {renderStatusBlock()}
        {renderDecisionActions()}
        {actionError ? <p className={styles.errorText}>{actionError}</p> : null}

        {latestAuction ? (
          <Link href={`/seller/auctions/${latestAuction.id}`} className={styles.inlineLink}>
            <span>View Auction</span>
            <IconArrowRight size={14} strokeWidth={2} />
          </Link>
        ) : (
          <Link href={`/seller/vehicles/${vehicle.id}`} className={styles.inlineLink}>
            <span>View Vehicle</span>
            <IconArrowRight size={14} strokeWidth={2} />
          </Link>
        )}
      </div>
    </article>
  );
}
