'use client';

import { Fragment, useEffect, useState } from 'react';
import { formatCountdown, pad } from '@/src/lib/utils';
import styles from './HomeSections.module.css';

export default function WeekCountdown({ auctionDate }: { auctionDate: string }) {
  const [cd, setCd] = useState(() =>
    formatCountdown(new Date(auctionDate).getTime() - Date.now())
  );

  useEffect(() => {
    const t = setInterval(() =>
      setCd(formatCountdown(new Date(auctionDate).getTime() - Date.now())), 1000
    );
    return () => clearInterval(t);
  }, [auctionDate]);

  return (
    <div className={styles.cdBlock}>
      <div className={styles.cdLabel}>Auction Starts In</div>
      <div className={styles.cdUnits}>
        {[
          { val: cd.days,    lbl: 'Days' },
          { val: cd.hours,   lbl: 'Hours' },
          { val: cd.minutes, lbl: 'Min' },
          { val: cd.seconds, lbl: 'Sec' },
        ].map(({ val, lbl }, i) => (
          <Fragment key={lbl}>
            {i > 0 && <div key={`sep-${i}`} className={styles.cdSep}>:</div>}
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(val)}</div>
              <div className={styles.cdUnitLbl}>{lbl}</div>
            </div>
          </Fragment>
        ))}
      </div>
      <div className={styles.cdInfo}>
        <div className={styles.cdInfoLbl}>Viewing Slots</div>
        <div className={styles.cdInfoRow}>Tue 4 March · 10:00 – 17:00</div>
        <div className={styles.cdInfoRow}>Wed 5 March · 10:00 – 17:00</div>
        <a href="/register?action=inspection"
           className={`btn btn-ghost-white btn-sm btn-full ${styles.cdCta}`}>
          Book Inspection Slot
        </a>
      </div>
    </div>
  );
}
