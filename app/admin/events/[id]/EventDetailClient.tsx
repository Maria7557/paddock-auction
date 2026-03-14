"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatAed } from "@/src/lib/utils";

import styles from "./page.module.css";

type EventLot = {
  auctionId: string;
  vehicleId: string;
  title: string;
  vin: string;
  imageUrl: string | null;
  marketPriceAed: number;
  sequence: number;
};

type CandidateVehicle = {
  id: string;
  label: string;
};

type EventDetailClientProps = {
  eventId: string;
  title: string;
  description: string;
  status: string;
  startsAt: string;
  lots: EventLot[];
  candidates: CandidateVehicle[];
};

function reorderLots(list: EventLot[], fromIndex: number, toIndex: number): EventLot[] {
  const clone = [...list];
  const [moved] = clone.splice(fromIndex, 1);
  clone.splice(toIndex, 0, moved);

  return clone.map((lot, index) => ({
    ...lot,
    sequence: index + 1,
  }));
}

export function EventDetailClient({
  eventId,
  title,
  description,
  status,
  startsAt,
  lots,
  candidates,
}: EventDetailClientProps) {
  const router = useRouter();

  const [lotRows, setLotRows] = useState<EventLot[]>(lots);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(candidates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const canReorder = lotRows.length > 1;

  async function callMutation(path: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);

    try {
      await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;

    if (target < 0 || target >= lotRows.length) {
      return;
    }

    const reordered = reorderLots(lotRows, index, target);
    setLotRows(reordered);

    await callMutation(`/api/admin/events/${eventId}/reorder`, {
      vehicleIds: reordered.map((lot) => lot.vehicleId),
    });
  }

  async function removeVehicle(vehicleId: string): Promise<void> {
    await callMutation(`/api/admin/events/${eventId}/remove-vehicle`, {
      vehicleId,
    });
  }

  async function addVehicle(): Promise<void> {
    if (!selectedVehicleId) {
      return;
    }

    await callMutation(`/api/admin/events/${eventId}/add-vehicle`, {
      vehicleId: selectedVehicleId,
    });
  }

  const statusPill = useMemo(() => {
    if (status === "SCHEDULED") {
      return <span className="pill pill-sched">Scheduled</span>;
    }

    if (status === "LIVE" || status === "EXTENDED") {
      return (
        <span className="pill pill-live">
          <span className="live-dot" aria-hidden />
          Live
        </span>
      );
    }

    if (status === "DRAFT") {
      return <span className="pill">Draft</span>;
    }

    return <span className="pill">Ended</span>;
  }, [status]);

  return (
    <section className={styles.page}>
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.heading}>{title}</h1>
          <p className={styles.metaLine}>
            {new Date(startsAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        <div>{statusPill}</div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Lot List</div>
        <div className={styles.scrollWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Photo</th>
                <th>Brand / Model / Year</th>
                <th>VIN</th>
                <th>Market Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lotRows.map((lot, index) => (
                <tr key={lot.auctionId}>
                  <td>
                    <div className={styles.orderCell}>
                      <span>{lot.sequence}</span>
                      <div className={styles.orderButtons}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={!canReorder || busy || index === 0}
                          onClick={() => void move(index, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={!canReorder || busy || index === lotRows.length - 1}
                          onClick={() => void move(index, 1)}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
                    {lot.imageUrl ? (
                      <img src={lot.imageUrl} alt={lot.title} className={styles.thumb} loading="lazy" />
                    ) : (
                      <div className={styles.thumbPlaceholder} aria-hidden />
                    )}
                  </td>
                  <td>{lot.title}</td>
                  <td className={styles.mono}>{lot.vin}</td>
                  <td>{formatAed(lot.marketPriceAed || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => void removeVehicle(lot.vehicleId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {lotRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    No lots in this event.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Add Vehicle</div>
        <div className={styles.addWrap}>
          <select
            value={selectedVehicleId}
            onChange={(event) => setSelectedVehicleId(event.target.value)}
            disabled={busy || candidates.length === 0}
          >
            <option value="">Select vehicle</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !selectedVehicleId}
            onClick={() => void addVehicle()}
          >
            Add to Event
          </button>
        </div>
      </section>
    </section>
  );
}
