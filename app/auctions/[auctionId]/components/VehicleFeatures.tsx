"use client";

import { useMemo, useState } from "react";

import { IconArrowRight } from "@/components/ui/icons";
import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./Sections.module.css";

const FEATURE_GROUPS = {
  en: [
    {
      label: "Comfort & interior",
      items: ["Leather Seats", "Automatic Climate Control", "Power Seats", "Rear AC Vents"],
    },
    {
      label: "Safety",
      items: ["ABS", "Airbags", "Blind Spot Monitor", "Lane Assist"],
    },
    {
      label: "Technology",
      items: ["Apple CarPlay", "Navigation", "Reverse Camera", "Adaptive Cruise Control", "Digital Displays", "360 Camera"],
    },
    {
      label: "Exterior",
      items: ["LED Headlights", "Alloy Wheels", "Sunroof", "Parking Sensors"],
    },
  ],
  ru: [
    {
      label: "Комфорт и салон",
      items: ["Leather Seats", "Automatic Climate Control", "Power Seats", "Rear AC Vents"],
    },
    {
      label: "Безопасность",
      items: ["ABS", "Airbags", "Blind Spot Monitor", "Lane Assist"],
    },
    {
      label: "Технологии",
      items: ["Apple CarPlay", "Navigation", "Reverse Camera", "Adaptive Cruise Control", "Digital Displays", "360 Camera"],
    },
    {
      label: "Экстерьер",
      items: ["LED Headlights", "Alloy Wheels", "Sunroof", "Parking Sensors"],
    },
  ],
} as const;

type Props = {
  features: string[];
  locale: SupportedLocale;
};

function normalizeFeature(value: string): string {
  return value.trim().toLowerCase();
}

export function VehicleFeatures({ features, locale }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const featureSet = useMemo(() => new Set(features.map(normalizeFeature)), [features]);
  const groups = FEATURE_GROUPS[locale];
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
                {group.items.map((item) => {
                  const isPresent = featureSet.has(normalizeFeature(item));

                  return (
                    <div key={item} className={styles.featureItem}>
                      <span
                        className={`${styles.featureDot} ${isPresent ? styles.featureDotPresent : styles.featureDotAbsent}`}
                        aria-hidden
                      />
                      <span className={isPresent ? styles.featureTextPresent : styles.featureTextAbsent}>{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
