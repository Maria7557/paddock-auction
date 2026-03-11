import { Suspense } from "react";

import { getPublicDisplaySettings } from "@/src/lib/display_preferences";

import { AuctionsClient } from "./AuctionsClient";
import styles from "./page.module.css";

export const metadata = {
  title: "All Auctions — FleetBid",
};

type SearchParamsInput = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParamsInput>;
};

function normalizeSearchParams(input: SearchParamsInput | undefined): Record<string, string> {
  if (!input) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }

    if (Array.isArray(value) && value.length > 0) {
      normalized[key] = value[0] ?? "";
    }
  }

  return normalized;
}

export default async function AuctionsPage({ searchParams }: PageProps) {
  const display = await getPublicDisplaySettings();
  const resolvedParams = await searchParams;
  const initialParams = normalizeSearchParams(resolvedParams);

  const copy =
    display.locale === "ru"
      ? {
          heading: "Все лоты",
          sub: "Автомобили от проверенных продавцов ОАЭ: live-аукционы и ближайшие лоты.",
        }
      : {
          heading: "All Lots",
          sub: "Fleet vehicles from verified UAE sellers, including live auctions and upcoming lots.",
        };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{copy.heading}</h1>
        <p className={styles.sub}>{copy.sub}</p>
      </div>

      <Suspense fallback={<AuctionsSkeleton />}>
        <AuctionsClient initialParams={initialParams} display={display} />
      </Suspense>
    </main>
  );
}

function AuctionsSkeleton() {
  return (
    <div className={styles.skeleton}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className={styles.skeletonCard} />
      ))}
    </div>
  );
}
