"use client";

import { useState } from "react";

import { VipUpgradeModal } from "@/components/buyer/VipUpgradeModal";

import styles from "./VipPromoBanner.module.css";

type VipPromoBannerProps = {
  tier: "STANDARD" | "VIP";
  upgradeStatus: "NONE" | "PENDING" | "APPROVED";
};

export function VipPromoBanner({ tier, upgradeStatus }: VipPromoBannerProps) {
  const [isModalOpen, setModalOpen] = useState(false);

  if (tier === "VIP") {
    return null;
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.banner}>
        {upgradeStatus === "PENDING" || upgradeStatus === "APPROVED" ? (
          <div className={styles.pending}>
            <h2>
              {upgradeStatus === "APPROVED"
                ? "Your VIP application has been approved"
                : "Your VIP application is under review"}
            </h2>
            <p>
              {upgradeStatus === "APPROVED"
                ? "We are updating your buyer tier now. Your account will refresh shortly."
                : "We&apos;ll be in touch within 1–2 business days."}
            </p>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.copy}>
              <h2>Want to see Buy Now prices?</h2>
              <p>
                VIP buyers can see Buy Now prices and purchase vehicles before the auction
                starts. 4% commission instead of 2%.
              </p>
              <div className={styles.chips}>
                <span>Buy Now prices</span>
                <span>Pre-auction purchase</span>
                <span>4% commission</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
            >
              Become a VIP buyer
            </button>
          </div>
        )}
      </section>

      <VipUpgradeModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
