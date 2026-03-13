"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LotCard } from "@/components/auction/LotCard";
import { api } from "@/src/lib/api-client";
import type { DisplaySettings } from "@/src/lib/money";

import { ActiveFilters } from "./components/ActiveFilters";
import { FilterSidebar } from "./components/FilterSidebar";
import { SortBar } from "./components/SortBar";
import styles from "./AuctionsClient.module.css";

interface Lot {
  id: string;
  state: "LIVE" | "SCHEDULED" | "CLOSED";
  title: string;
  year: number;
  mileageKm: number;
  imageUrl: string;
  currentBidAed: number;
  marketPriceAed?: number | null;
  endsAt: string | null;
  startsAt: string | null;
  totalBids: number;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    mileage: number;
    bodyType?: string;
    fuelType?: string;
    regionSpec?: string;
    images?: string[];
  };
  seller: {
    name: string;
    referenceCode: string;
  };
}

type Filters = {
  brand: string;
  model: string;
  status: string;
  minPrice: string;
  maxPrice: string;
  region: string;
  bodyType: string;
  fuelType: string;
  maxMileage: string;
  minYear: string;
  sort: string;
};

const DEFAULT_FILTERS: Filters = {
  brand: "",
  model: "",
  status: "",
  minPrice: "",
  maxPrice: "",
  region: "",
  bodyType: "",
  fuelType: "",
  maxMileage: "",
  minYear: "",
  sort: "ending_soon",
};

function sanitizeFilters(filters: Filters): Filters {
  const next = { ...filters };

  if (!next.brand) {
    next.model = "";
  }

  if (
    next.minPrice &&
    next.maxPrice &&
    Number.isFinite(Number(next.minPrice)) &&
    Number.isFinite(Number(next.maxPrice)) &&
    Number(next.minPrice) > Number(next.maxPrice)
  ) {
    next.maxPrice = "";
  }

  return next;
}

function mergeInitialFilters(initialParams: Record<string, string>): Filters {
  const merged: Filters = { ...DEFAULT_FILTERS };

  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>) {
    const value = initialParams[key];

    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return sanitizeFilters(merged);
}

function serializeFilters(filters: Filters, includeDefaults = true): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters) as Array<[keyof Filters, string]>) {
    if (!value) {
      continue;
    }

    if (!includeDefaults && value === DEFAULT_FILTERS[key]) {
      continue;
    }

    params.set(key, value);
  }

  return params.toString();
}

function buildUrl(pathname: string, queryString: string): string {
  if (!queryString) {
    return pathname;
  }

  return `${pathname}?${queryString}`;
}

export function AuctionsClient({
  initialParams,
  display,
}: {
  initialParams: Record<string, string>;
  display: DisplaySettings;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<Filters>(() => mergeInitialFilters(initialParams));
  const [lots, setLots] = useState<Lot[]>([]);
  const [catalogLots, setCatalogLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isRu = display.locale === "ru";

  const brandToModels = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const sourceLots = catalogLots.length > 0 ? catalogLots : lots;

    for (const lot of sourceLots) {
      const brand = lot.vehicle.brand.trim();
      const model = lot.vehicle.model.trim();

      if (!brand) {
        continue;
      }

      const models = map.get(brand) ?? new Set<string>();

      if (model) {
        models.add(model);
      }

      map.set(brand, models);
    }

    return map;
  }, [catalogLots, lots]);

  const brandOptions = useMemo(() => {
    return Array.from(brandToModels.keys()).sort((left, right) => left.localeCompare(right));
  }, [brandToModels]);

  const modelOptions = useMemo(() => {
    if (!filters.brand) {
      return [];
    }

    return Array.from(brandToModels.get(filters.brand) ?? []).sort((left, right) => left.localeCompare(right));
  }, [brandToModels, filters.brand]);

  const fetchLots = useCallback(async (nextFilters: Filters) => {
    setLoading(true);

    try {
      const data = await api.auctions.list<{
        lots?: Lot[];
        total?: number;
      }>(nextFilters, {
        cache: "no-store",
      });

      setLots(data.lots ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLots([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCatalogLots = useCallback(async () => {
    try {
      const data = await api.auctions.list<{ lots?: Lot[] }>(undefined, { cache: "no-store" });
      setCatalogLots(data.lots ?? []);
    } catch {
      setCatalogLots([]);
    }
  }, []);

  useEffect(() => {
    void fetchLots(filters);
    void fetchCatalogLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(
    (nextFilters: Filters) => {
      const sanitizedFilters = sanitizeFilters(nextFilters);

      setFilters(sanitizedFilters);
      void fetchLots(sanitizedFilters);

      const queryString = serializeFilters(sanitizedFilters, false);

      startTransition(() => {
        router.replace(buildUrl(pathname, queryString), { scroll: false });
      });
    },
    [fetchLots, pathname, router],
  );

  const updateFilter = useCallback(
    (key: keyof Filters, value: string) => {
      const nextFilters = {
        ...filters,
        [key]: value,
      };

      if (key === "brand") {
        nextFilters.model = "";
      }

      applyFilters(nextFilters);
    },
    [applyFilters, filters],
  );

  const clearFilter = useCallback(
    (key: keyof Filters) => {
      updateFilter(key, DEFAULT_FILTERS[key]);
    },
    [updateFilter],
  );

  const clearAll = useCallback(() => {
    applyFilters({ ...DEFAULT_FILTERS });
  }, [applyFilters]);

  const activeCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === "sort") {
        return false;
      }

      return value !== DEFAULT_FILTERS[key as keyof Filters];
    }).length;
  }, [filters]);

  return (
    <div className={styles.layout}>
      <button
        type="button"
        className={styles.mobileFilterBtn}
        onClick={() => setMobileFiltersOpen((open) => !open)}
      >
        {mobileFiltersOpen
          ? isRu
            ? "Скрыть фильтры"
            : "Close Filters"
          : isRu
            ? `Фильтры${activeCount > 0 ? ` (${activeCount})` : ""}`
            : `Filters${activeCount > 0 ? ` (${activeCount})` : ""}`}
      </button>

      <aside className={`${styles.sidebar} ${mobileFiltersOpen ? styles.sidebarOpen : ""}`}>
        <FilterSidebar
          filters={filters}
          brands={brandOptions}
          models={modelOptions}
          onChange={(key, value) => updateFilter(key as keyof Filters, value)}
          onClearAll={clearAll}
          activeCount={activeCount}
          display={display}
        />
      </aside>

      <div className={styles.main}>
        <SortBar
          sort={filters.sort}
          total={total}
          loading={loading || isPending}
          onChange={(value) => updateFilter("sort", value)}
          locale={display.locale}
        />

        <ActiveFilters
          filters={filters}
          onClear={(key) => clearFilter(key as keyof Filters)}
          onClearAll={clearAll}
          display={display}
        />

        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.skeletonCard} />
            ))}
          </div>
        ) : lots.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{isRu ? "Лоты не найдены" : "No lots found"}</p>
            <p className={styles.emptySub}>{isRu ? "Попробуйте изменить фильтры." : "Try adjusting your filters."}</p>
            <button type="button" className={styles.clearBtn} onClick={clearAll}>
              {isRu ? "Сбросить фильтры" : "Clear all filters"}
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lotId={lot.id}
                title={lot.title}
                year={lot.year}
                mileage={lot.mileageKm}
                imageUrl={lot.imageUrl}
                currentBid={lot.currentBidAed}
                marketPrice={lot.marketPriceAed ?? undefined}
                status={lot.state}
                endTime={lot.endsAt ?? lot.startsAt ?? new Date().toISOString()}
                display={display}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
