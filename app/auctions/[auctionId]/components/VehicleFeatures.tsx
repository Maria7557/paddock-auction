"use client";

import { useMemo, useState } from "react";

import type { SellerVehicleFeatures } from "@/components/seller/vehicle-form-state";
import { IconArrowRight } from "@/components/ui/icons";
import type { SupportedLocale } from "@/src/i18n/routing";

import { getLotFeatureDisplayGroups } from "../feature-catalog";
import styles from "./Sections.module.css";

type Props = {
  features: SellerVehicleFeatures;
  locale: SupportedLocale;
};

export function VehicleFeatures({ features, locale }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const groups = useMemo(() => getLotFeatureDisplayGroups(features, locale), [features, locale]);
  const isRu = locale === "ru";

  return (
    <section className={styles.section} aria-labelledby="vehicle-features-title">
      <button
        type="button"
        className={styles.accordionButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="vehicle-features-panel"
      >
        <span id="vehicle-features-title" className={styles.sectionTitle}>
          {isRu ? "Оснащение и оборудование" : "Features & equipment"}
        </span>
        <IconArrowRight
          size={16}
          className={`${styles.accordionIcon} ${isOpen ? styles.accordionIconOpen : ""}`}
        />
      </button>

      {isOpen ? (
        <div id="vehicle-features-panel" className={styles.featureSections}>
          {groups.map((group) => (
            <div key={group.label} className={styles.featureGroup}>
              <p className={styles.featureGroupLabel}>{group.label}</p>
              <div className={styles.featureList}>
                {group.items.map((item) => (
                  <div key={item.label} className={styles.featureItem}>
                    <span
                      className={`${styles.featureDot} ${item.present ? styles.featureDotPresent : styles.featureDotAbsent}`}
                      aria-hidden
                    />
                    <span className={item.present ? styles.featureTextPresent : styles.featureTextAbsent}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
