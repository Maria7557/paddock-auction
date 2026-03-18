"use client";

import { useState } from "react";

import { VipUpgradeModal } from "@/components/buyer/VipUpgradeModal";

import styles from "./ProfileVipBanner.module.css";

type ProfileVipBannerProps = {
  tier: "STANDARD" | "VIP";
};

export function ProfileVipBanner({ tier }: ProfileVipBannerProps) {
  const [isModalOpen, setModalOpen] = useState(false);

  if (tier === "VIP") {
    return null;
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <div className={styles.copy}>
          <h2>Upgrade to VIP — unlock Buy Now purchases</h2>
          <p>
            Buy Now prices are visible to all buyers. VIP buyers can complete purchases
            before the auction starts. 4% commission instead of 2%.
          </p>
        </div>

        <button
          type="button"
          className={styles.button}
          onClick={() => setModalOpen(true)}
        >
          Become VIP
        </button>
      </section>

      <VipUpgradeModal key={isModalOpen ? "open" : "closed"} isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
