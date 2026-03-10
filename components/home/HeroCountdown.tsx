'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, pad } from '@/src/lib/utils';
import styles from './HeroSection.module.css';

export default function HeroCountdown({ endsAt }: { endsAt: string }) {
  const [cd, setCd] = useState(() =>
    formatCountdown(new Date(endsAt).getTime() - Date.now())
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(endsAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return (
    <div className={styles.footer}>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.hours)}</div>
        <div className={styles.footerLbl}>Hours</div>
      </div>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.minutes)}</div>
        <div className={styles.footerLbl}>Minutes</div>
      </div>
      <div className={styles.footerCell}>
        <div className={styles.footerVal}>{pad(cd.seconds)}</div>
        <div className={styles.footerLbl}>Seconds</div>
      </div>
    </div>
  );
}
