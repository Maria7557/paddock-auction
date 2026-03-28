"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api, type EventResultEntry } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type EventResultsClientProps = {
  eventTitle: string;
  scheduledAt: string;
  results: EventResultEntry[];
};

function formatAuctionStateValue(value: string): string {
  return value.trim().replaceAll("_", " ");
}

function getAuctionStateDisplay(auctionState: string): { label: string; className: string } {
  const normalized = auctionState.trim().toUpperCase();

  if (normalized === "PAYMENT_PENDING") {
    return {
      label: "Awaiting Payment",
      className: styles.statusWarning,
    };
  }

  if (normalized === "AWAITING_SELLER_DECISION") {
    return {
      label: "Awaiting Seller",
      className: styles.statusWarning,
    };
  }

  if (normalized === "PAID" || normalized === "SETTLED") {
    return {
      label: "Sold",
      className: styles.statusSuccess,
    };
  }

  if (normalized === "RELISTED") {
    return {
      label: "Relisted",
      className: styles.statusMuted,
    };
  }

  if (normalized === "DEFAULTED") {
    return {
      label: "Defaulted",
      className: styles.statusDanger,
    };
  }

  if (normalized === "CANCELED") {
    return {
      label: "Cancelled",
      className: styles.statusMuted,
    };
  }

  return {
    label: formatAuctionStateValue(normalized || "ENDED"),
    className: styles.statusMuted,
  };
}

function getLegacyStatusDisplay(status: EventResultEntry["status"]): { label: string; className: string } {
  if (status === "UNSOLD") {
    return {
      label: "UNSOLD",
      className: styles.statusMuted,
    };
  }

  if (status === "SOLD_DEFAULTED") {
    return {
      label: "Defaulted",
      className: styles.statusDanger,
    };
  }

  return {
    label: "Sold",
    className: styles.statusSuccess,
  };
}

function getResultStatusDisplay(result: EventResultEntry): { label: string; className: string } {
  const auctionState = result.auctionState?.trim();

  if (auctionState) {
    return getAuctionStateDisplay(auctionState);
  }

  return getLegacyStatusDisplay(result.status);
}

export function EventResultsClient({ eventTitle, scheduledAt, results }: EventResultsClientProps) {
  const router = useRouter();
  const [relistErrorByAuctionId, setRelistErrorByAuctionId] = useState<Record<string, string>>({});
  const [relistingAuctionId, setRelistingAuctionId] = useState<string | null>(null);
  const soldCount = useMemo(
    () => results.filter((result) => result.status === "SOLD" || result.status === "SOLD_DEFAULTED").length,
    [results],
  );
  const unsoldCount = useMemo(() => results.filter((result) => result.status === "UNSOLD").length, [results]);

  async function handleRelist(auctionId: string): Promise<void> {
    setRelistingAuctionId(auctionId);
    setRelistErrorByAuctionId((current) => {
      if (!(auctionId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[auctionId];
      return next;
    });

    try {
      await api.admin.auctions.relist(auctionId);
      router.refresh();
    } catch {
      setRelistErrorByAuctionId((current) => ({
        ...current,
        [auctionId]: "Failed to re-list",
      }));
    } finally {
      setRelistingAuctionId((current) => (current === auctionId ? null : current));
    }
  }

  function downloadCsv(): void {
    const rows = [
      ["#", "Vehicle", "Seller Company", "Status", "Winning Bid", "Bids", "Buyer Company", "Payment"],
      ...results.map((result) => [
        String(result.position + 1),
        result.vehicle,
        result.sellerCompany ?? "",
        getResultStatusDisplay(result).label,
        String(result.winningBid),
        String(result.bids),
        result.buyerCompany ?? "",
        result.payment ?? "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${value.replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-results.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>{eventTitle}</h1>
          <p className={styles.metaLine}>
            Results board ·{" "}
            {new Intl.DateTimeFormat("en-AE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(scheduledAt))}
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={downloadCsv}>
          Download CSV
        </button>
      </div>

      <div className={styles.consoleFooter}>
        <span>Total lots: {results.length}</span>
        <span>Sold: {soldCount}</span>
        <span>Unsold: {unsoldCount}</span>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Post-event results</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Vehicle</th>
                <th>Seller Company</th>
                <th>Status</th>
                <th>Winning Bid</th>
                <th>Bids</th>
                <th>Buyer Company</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const statusDisplay = getResultStatusDisplay(result);

                return (
                  <tr key={result.lotId}>
                    <td className={styles.mono}>#{result.position + 1}</td>
                    <td>{result.vehicle}</td>
                    <td>{result.sellerCompany ?? "—"}</td>
                    <td>
                      <div className={styles.statusActions}>
                        <span className={`${styles.statusBadge} ${statusDisplay.className}`}>
                          {statusDisplay.label}
                        </span>
                        {result.status === "UNSOLD" ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleRelist(result.auctionId)}
                            disabled={relistingAuctionId === result.auctionId}
                          >
                            Re-list
                          </button>
                        ) : null}
                        {relistErrorByAuctionId[result.auctionId] ? (
                          <span className={styles.inlineErrorText}>{relistErrorByAuctionId[result.auctionId]}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{result.status === "UNSOLD" ? "—" : formatAed(result.winningBid)}</td>
                    <td>{result.bids}</td>
                    <td>{result.buyerCompany ?? "—"}</td>
                    <td>{result.payment ?? "—"}</td>
                  </tr>
                );
              })}
              {results.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    No results yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
