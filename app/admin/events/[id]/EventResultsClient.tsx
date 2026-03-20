"use client";

import { useMemo } from "react";

import type { EventResultEntry } from "@/src/lib/api-client";
import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type EventResultsClientProps = {
  eventTitle: string;
  scheduledAt: string;
  results: EventResultEntry[];
};

function getStatusLabel(status: EventResultEntry["status"]): string {
  if (status === "SOLD_DEFAULTED") {
    return "SOLD (DEFAULTED)";
  }

  return status;
}

function getStatusClassName(status: EventResultEntry["status"]): string {
  if (status === "UNSOLD") {
    return styles.statusMuted;
  }

  if (status === "SOLD_DEFAULTED") {
    return styles.statusDanger;
  }

  return styles.statusSuccess;
}

export function EventResultsClient({ eventTitle, scheduledAt, results }: EventResultsClientProps) {
  const soldCount = useMemo(
    () => results.filter((result) => result.status === "SOLD" || result.status === "SOLD_DEFAULTED").length,
    [results],
  );
  const unsoldCount = useMemo(() => results.filter((result) => result.status === "UNSOLD").length, [results]);

  function downloadCsv(): void {
    const rows = [
      ["#", "Vehicle", "Status", "Winning Bid", "Bids", "Buyer Company", "Payment"],
      ...results.map((result) => [
        String(result.position + 1),
        result.vehicle,
        getStatusLabel(result.status),
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
            Results board · {new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(scheduledAt))}
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
                <th>Status</th>
                <th>Winning Bid</th>
                <th>Bids</th>
                <th>Buyer Company</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.lotId}>
                  <td className={styles.mono}>#{result.position + 1}</td>
                  <td>{result.vehicle}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${getStatusClassName(result.status)}`}>
                      {getStatusLabel(result.status)}
                    </span>
                  </td>
                  <td>{result.status === "UNSOLD" ? "—" : formatAed(result.winningBid)}</td>
                  <td>{result.bids}</td>
                  <td>{result.buyerCompany ?? "—"}</td>
                  <td>{result.payment ?? "—"}</td>
                </tr>
              ))}
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
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
