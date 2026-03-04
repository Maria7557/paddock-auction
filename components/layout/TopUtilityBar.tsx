import Link from "next/link";
import { ChevronDown } from "lucide-react";

import styles from "./TopUtilityBar.module.css";

export function TopUtilityBar() {
  return (
    <div className={styles.bar} role="region" aria-label="Marketplace utility">
      <div className={styles.left}>
        <span>Verified Members Only</span>
      </div>

      <div className={styles.right}>
        <label className={styles.countrySelectWrap}>
          <span className={styles.srOnly}>Select currency</span>
          <select className={styles.countrySelect} defaultValue="aed" aria-label="Currency selector">
            <option value="aed">AED</option>
            <option value="usd">USD</option>
          </select>
          <ChevronDown size={12} className={styles.countryChevron} aria-hidden="true" />
        </label>

        <label className={styles.countrySelectWrap}>
          <span className={styles.srOnly}>Select language</span>
          <select className={styles.countrySelect} defaultValue="en" aria-label="Language selector">
            <option value="en">EN</option>
            <option value="ar">AR</option>
          </select>
          <ChevronDown size={12} className={styles.countryChevron} aria-hidden="true" />
        </label>

        <Link href="#" className={styles.supportLink}>
          Support
        </Link>
      </div>
    </div>
  );
}
