// app/lot/[id]/components/InspectionSection.tsx
// Client component — buttons fire API calls / navigation

'use client';

import { useState } from 'react';
import styles from './Sections.module.css';

type Props = { auctionId: string; startsAt: string };

export function InspectionSection({ auctionId, startsAt }: Props) {
  const [requested, setRequested] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  const viewDate = new Date(startsAt);
  const viewEnd  = new Date(viewDate.getTime() - 86_400_000); // day before
  const viewStart = new Date(viewDate.getTime() - 2 * 86_400_000); // 2 days before

  const handleDownload = () => {
    window.open(`/api/auctions/${auctionId}/inspection-report`, '_blank');
  };
  const handleRequest  = () => setRequested(true);
  const handleSchedule = () => setScheduled(true);

  return (
    <section className={styles.card} aria-labelledby="ins-heading">
      <h2 id="ins-heading" className={styles.cardTitle}>Inspection</h2>

      <div className={styles.inspectLayout}>
        {/* Viewing window */}
        <div className={styles.inspectInfo}>
          <div className={styles.inspectSubhead}>Preview Window</div>
          <div className={styles.inspectDates}>
            <strong>Viewing Dates</strong>
            <p>
              {viewStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              &nbsp;–&nbsp;
              {viewEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
            <p className={styles.inspectTime}>10:00 – 17:00 GST</p>
            <p className={styles.inspectAddr}>Dubai Warehouse · Al Quoz Industrial Area 2</p>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.inspectActions}>
          <button
            className={`btn btn-primary ${styles.inspectBtn}`}
            onClick={handleDownload}
          >
            <span aria-hidden>📄</span>
            Download Inspection Report
          </button>

          <button
            className={`btn btn-outline ${styles.inspectBtn}`}
            onClick={handleRequest}
            disabled={requested}
            aria-pressed={requested}
          >
            <span aria-hidden>{requested ? '✓' : '🔍'}</span>
            {requested ? 'Inspection Requested' : 'Request Inspection'}
          </button>

          <button
            className={`btn btn-outline ${styles.inspectBtn}`}
            onClick={handleSchedule}
            disabled={scheduled}
            aria-pressed={scheduled}
          >
            <span aria-hidden>{scheduled ? '✓' : '📅'}</span>
            {scheduled ? 'Viewing Scheduled' : 'Schedule Viewing'}
          </button>
        </div>
      </div>
    </section>
  );
}
