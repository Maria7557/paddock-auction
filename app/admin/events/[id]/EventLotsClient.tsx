"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type AdminEventLotsResponse,
  api,
  getApiErrorMessage,
} from "@/src/lib/api-client";

import styles from "./page.module.css";

type EventLotsClientProps = {
  eventId: string;
  initialData: AdminEventLotsResponse;
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderStateBadge(state: string) {
  if (state === "ON_BLOCK") {
    return <span className={`${styles.statusBadge} ${styles.statusLive}`}>On block</span>;
  }

  if (state === "QUEUED") {
    return <span className={`${styles.statusBadge} ${styles.statusScheduled}`}>Queued</span>;
  }

  if (state === "SOLD") {
    return <span className={`${styles.statusBadge} ${styles.statusSuccess}`}>Sold</span>;
  }

  if (state === "UNSOLD" || state === "CLOSED") {
    return <span className={`${styles.statusBadge} ${styles.statusMuted}`}>Unsold</span>;
  }

  return <span className={styles.statusBadge}>{state.replaceAll("_", " ")}</span>;
}

export function EventLotsClient({ eventId, initialData }: EventLotsClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const nextPosition =
    initialData.lots.reduce((maxPosition, lot) => Math.max(maxPosition, lot.position), -1) + 1;
  const filteredAuctions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return initialData.availableAuctions;
    }

    return initialData.availableAuctions.filter((auction) => auction.title.toLowerCase().includes(query));
  }, [initialData.availableAuctions, search]);

  async function addSelectedLot(): Promise<void> {
    if (!selectedAuctionId) {
      setError("Select a lot to add to the queue.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.admin.events.addLotToEvent(eventId, selectedAuctionId, nextPosition);
      setIsModalOpen(false);
      setSearch("");
      setSelectedAuctionId("");
      router.refresh();
    } catch (addError) {
      setError(getApiErrorMessage(addError, "Unable to add this lot to the event."));
    } finally {
      setBusy(false);
    }
  }

  async function removeLot(lotId: string): Promise<void> {
    setPendingRemoveId(lotId);
    setError(null);

    try {
      await api.admin.events.removeLotFromEvent(eventId, lotId);
      router.refresh();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError, "Unable to remove this lot from the queue."));
    } finally {
      setPendingRemoveId(null);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>{initialData.event.title}</h1>
          <p className={styles.metaLine}>
            Scheduled for {formatDateTime(initialData.event.scheduledAt)} · {initialData.lots.length} lots
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          Add Lot
        </button>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Current Queue</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Position</th>
                <th>Vehicle</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialData.lots.map((lot) => (
                <tr key={lot.id}>
                  <td className={styles.mono}>#{lot.position + 1}</td>
                  <td>
                    <div className={styles.vehicleCell}>
                      {lot.imageUrl ? (
                        <img src={lot.imageUrl} alt={lot.title} className={styles.thumb} />
                      ) : (
                        <div className={styles.thumbPlaceholder} />
                      )}
                      <div>
                        <strong>{lot.title}</strong>
                        <div className={styles.vehicleMeta}>Start AED {lot.startingPrice.toLocaleString("en-AE")}</div>
                      </div>
                    </div>
                  </td>
                  <td>{renderStateBadge(lot.state)}</td>
                  <td>
                    {lot.state === "QUEUED" ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={pendingRemoveId === lot.id}
                        onClick={() => void removeLot(lot.id)}
                      >
                        {pendingRemoveId === lot.id ? "Removing..." : "Remove"}
                      </button>
                    ) : (
                      <span className={styles.helperText}>Locked after the lot goes on block</span>
                    )}
                  </td>
                </tr>
              ))}
              {initialData.lots.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>
                    No lots queued yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className={styles.errorText}>{error}</p> : null}

      {isModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-lot-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="add-lot-title" className={styles.modalTitle}>
                  Add Lot to Event
                </h2>
                <p className={styles.modalSubtitle}>The selected lot will be appended as position {nextPosition + 1}.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={styles.searchInput}
              placeholder="Search scheduled lots"
            />

            <div className={styles.modalList}>
              {filteredAuctions.map((auction) => (
                <label key={auction.auctionId} className={styles.modalOption}>
                  <input
                    type="radio"
                    name="auction"
                    checked={selectedAuctionId === auction.auctionId}
                    onChange={() => setSelectedAuctionId(auction.auctionId)}
                  />
                  <div>
                    <strong>{auction.title}</strong>
                    <div className={styles.vehicleMeta}>Start AED {auction.startingPrice.toLocaleString("en-AE")}</div>
                  </div>
                </label>
              ))}
              {filteredAuctions.length === 0 ? (
                <div className={styles.emptyStateCard}>No scheduled lots available to add.</div>
              ) : null}
            </div>

            <div className={styles.modalActions}>
              <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void addSelectedLot()} disabled={busy}>
                {busy ? "Adding..." : "Add to Queue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
