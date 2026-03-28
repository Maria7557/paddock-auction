"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LotCard } from "@/components/auction/LotCard";
import { ApiError, api } from "@/src/lib/api-client";
import { isLiveAuctionState } from "@/src/lib/auction-display";
import type { DisplaySettings } from "@/src/lib/money";

import { ActiveFilters } from "./components/ActiveFilters";
import { FilterSidebar } from "./components/FilterSidebar";
import { SortBar } from "./components/SortBar";
import styles from "./AuctionsClient.module.css";

interface Lot {
  id: string;
  state:
    | "DRAFT"
    | "SCHEDULED"
    | "LIVE"
    | "EXTENDED"
    | "PAYMENT_PENDING"
    | "ENDED"
    | "DEFAULTED"
    | "CLOSED"
    | "PAID"
    | "CANCELED"
    | "RELISTED";
  title: string;
  year: number;
  mileageKm: number;
  imageUrl: string;
  currentBidAed: number;
  marketPriceAed?: number | null;
  buyNowPrice?: number | null;
  endsAt: string | null;
  startsAt: string | null;
  totalBids: number;
  showVipEarlyAccessBadge?: boolean;
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

type BuyerTier = "STANDARD" | "VIP";

type ApiAuction = {
  id?: string;
  state?: string;
  currentPrice?: number;
  startingPrice?: number;
  buyNowPrice?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sellerName?: string;
  sellerRef?: string;
  location?: string;
  totalBids?: number;
  showVipEarlyAccessBadge?: boolean;
  vehicle?: {
    brand?: string;
    model?: string;
    year?: number;
    mileage?: number;
    bodyType?: string;
    fuelType?: string;
    regionSpec?: string;
    images?: string[];
    marketPrice?: number | null;
  };
};

type BuyerDashboardResponse = {
  vipStatus?: {
    tier?: BuyerTier;
  };
};

type Filters = {
  vipEarlyAccess: string;
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
  vipEarlyAccess: "",
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

function sanitizeFilters(
  filters: Filters,
  options: {
    canUseVipEarlyAccessFilter: boolean;
  },
): Filters {
  const next = { ...filters };

  if (!options.canUseVipEarlyAccessFilter) {
    next.vipEarlyAccess = "";
  }

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

function mergeInitialFilters(
  initialParams: Record<string, string>,
  options: {
    canUseVipEarlyAccessFilter: boolean;
  },
): Filters {
  const merged: Filters = { ...DEFAULT_FILTERS };

  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>) {
    const value = initialParams[key];

    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return sanitizeFilters(merged, options);
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

function buildApiQuery(
  filters: Filters,
  options: {
    canUseVipEarlyAccessFilter: boolean;
  },
): Record<string, string> | undefined {
  if (options.canUseVipEarlyAccessFilter && filters.vipEarlyAccess === "active") {
    return {
      vipEarlyAccess: "active",
    };
  }

  return undefined;
}

function mapApiAuctionToLot(auction: ApiAuction): Lot | null {
  if (!auction.id) {
    return null;
  }

  const vehicle = auction.vehicle ?? {};
  const year = Number(vehicle.year ?? 0);
  const brand = String(vehicle.brand ?? "").trim();
  const model = String(vehicle.model ?? "").trim();

  return {
    id: String(auction.id ?? ""),
    state: (auction.state as Lot["state"] | undefined) ?? "SCHEDULED",
    title: `${brand} ${model} ${year || ""}`.trim() || `Lot ${String(auction.id ?? "").slice(0, 8).toUpperCase()}`,
    year,
    mileageKm: Number(vehicle.mileage ?? 0),
    imageUrl:
      Array.isArray(vehicle.images) && typeof vehicle.images[0] === "string" && vehicle.images[0].trim().length > 0
        ? vehicle.images[0]
        : "/vehicle-photo.svg",
    currentBidAed: Number(auction.currentPrice ?? auction.startingPrice ?? 0),
    marketPriceAed:
      vehicle.marketPrice === null || vehicle.marketPrice === undefined ? null : Number(vehicle.marketPrice),
    buyNowPrice: auction.buyNowPrice === null || auction.buyNowPrice === undefined ? null : Number(auction.buyNowPrice),
    endsAt: auction.endsAt ?? null,
    startsAt: auction.startsAt ?? null,
    totalBids: Number(auction.totalBids ?? 0),
    showVipEarlyAccessBadge: auction.showVipEarlyAccessBadge === true,
    vehicle: {
      brand,
      model,
      year,
      mileage: Number(vehicle.mileage ?? 0),
      bodyType: vehicle.bodyType,
      fuelType: vehicle.fuelType,
      regionSpec: vehicle.regionSpec,
      images: vehicle.images,
    },
    seller: {
      name: String(auction.sellerName ?? "").trim(),
      referenceCode: String(auction.sellerRef ?? "").trim(),
    },
  };
}

function filterAndSortLots(
  source: Lot[],
  filters: Filters,
  options: {
    prioritizeVipEarlyAccessLots: boolean;
  },
): Lot[] {
  const filtered = source.filter((lot) => {
    if (filters.vipEarlyAccess === "active" && lot.showVipEarlyAccessBadge !== true) {
      return false;
    }

    if (filters.brand && lot.vehicle.brand !== filters.brand) {
      return false;
    }

    if (filters.model && lot.vehicle.model !== filters.model) {
      return false;
    }

    if (filters.status && lot.state !== filters.status) {
      return false;
    }

    if (filters.minPrice && lot.currentBidAed < Number(filters.minPrice)) {
      return false;
    }

    if (filters.maxPrice && lot.currentBidAed > Number(filters.maxPrice)) {
      return false;
    }

    if (filters.region && lot.vehicle.regionSpec !== filters.region) {
      return false;
    }

    if (filters.bodyType && lot.vehicle.bodyType !== filters.bodyType) {
      return false;
    }

    if (filters.fuelType && lot.vehicle.fuelType !== filters.fuelType) {
      return false;
    }

    if (filters.maxMileage && lot.mileageKm > Number(filters.maxMileage)) {
      return false;
    }

    if (filters.minYear && lot.year < Number(filters.minYear)) {
      return false;
    }

    return true;
  });

  const sortedFullLots = filtered.sort((left, right) => {
    if (options.prioritizeVipEarlyAccessLots) {
      const leftVipPriority = left.showVipEarlyAccessBadge === true ? 1 : 0;
      const rightVipPriority = right.showVipEarlyAccessBadge === true ? 1 : 0;

      if (leftVipPriority !== rightVipPriority) {
        return rightVipPriority - leftVipPriority;
      }
    }

    if (filters.sort === "newest") {
      return new Date(right.startsAt ?? 0).getTime() - new Date(left.startsAt ?? 0).getTime();
    }

    if (filters.sort === "price_asc") {
      return left.currentBidAed - right.currentBidAed;
    }

    if (filters.sort === "price_desc") {
      return right.currentBidAed - left.currentBidAed;
    }

    return new Date(left.endsAt ?? left.startsAt ?? 0).getTime() - new Date(right.endsAt ?? right.startsAt ?? 0).getTime();
  });

  return sortedFullLots;
}

export function AuctionsClient({
  initialParams,
  display,
  viewerBuyerTier,
}: {
  initialParams: Record<string, string>;
  display: DisplaySettings;
  viewerBuyerTier: BuyerTier | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/auctions";
  const [isPending, startTransition] = useTransition();
  const [resolvedViewerBuyerTier, setResolvedViewerBuyerTier] = useState<BuyerTier | null>(viewerBuyerTier);
  const canUseVipEarlyAccessFilter = resolvedViewerBuyerTier === "VIP";
  const lastVipFilterCapabilityRef = useRef(canUseVipEarlyAccessFilter);

  const [filters, setFilters] = useState<Filters>(() =>
    mergeInitialFilters(initialParams, {
      canUseVipEarlyAccessFilter,
    }),
  );
  const [lots, setLots] = useState<Lot[]>([]);
  const [catalogLots, setCatalogLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isRu = display.locale === "ru";

  const brandToModels = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const sourceLots =
      filters.vipEarlyAccess === "active"
        ? lots
        : catalogLots.length > 0
          ? catalogLots
          : lots;

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
  }, [catalogLots, filters.vipEarlyAccess, lots]);

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
      const query = buildApiQuery(nextFilters, {
        canUseVipEarlyAccessFilter,
      });
      const data = await api.auctions.list<{
        auctions?: ApiAuction[];
        lots?: ApiAuction[];
        total?: number;
      }>(query, {
        cache: "no-store",
      });
      const mappedLots = (data.auctions ?? data.lots ?? [])
        .map(mapApiAuctionToLot)
        .filter((lot): lot is Lot => lot !== null);
      const filteredLots = filterAndSortLots(mappedLots, nextFilters, {
        prioritizeVipEarlyAccessLots: canUseVipEarlyAccessFilter,
      });

      setLots(filteredLots);
      setTotal(filteredLots.length);
    } catch {
      setLots([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canUseVipEarlyAccessFilter]);

  const fetchCatalogLots = useCallback(async () => {
    try {
      const data = await api.auctions.list<{ auctions?: ApiAuction[]; lots?: ApiAuction[] }>(undefined, {
        cache: "no-store",
      });
      setCatalogLots(
        (data.auctions ?? data.lots ?? [])
          .map(mapApiAuctionToLot)
          .filter((lot): lot is Lot => lot !== null),
      );
    } catch {
      setCatalogLots([]);
    }
  }, []);

  useEffect(() => {
    void fetchLots(filters);
    void fetchCatalogLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;

    if (viewerBuyerTier === null) {
      setResolvedViewerBuyerTier(null);
      return () => {
        active = false;
      };
    }

    async function syncBuyerTier(): Promise<void> {
      try {
        const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>({
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        setResolvedViewerBuyerTier(dashboard.vipStatus?.tier === "VIP" ? "VIP" : "STANDARD");
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.statusCode === 401) {
          setResolvedViewerBuyerTier(null);
        }
      }
    }

    void syncBuyerTier();

    return () => {
      active = false;
    };
  }, [viewerBuyerTier]);

  useEffect(() => {
    if (lastVipFilterCapabilityRef.current === canUseVipEarlyAccessFilter) {
      return;
    }

    lastVipFilterCapabilityRef.current = canUseVipEarlyAccessFilter;

    const sanitizedFilters = sanitizeFilters(filters, {
      canUseVipEarlyAccessFilter,
    });
    const nextQueryString = serializeFilters(sanitizedFilters, false);
    const currentQueryString = serializeFilters(filters, false);
    const filtersChanged = nextQueryString !== currentQueryString;

    void fetchLots(sanitizedFilters);
    void fetchCatalogLots();

    if (!filtersChanged) {
      return;
    }

    setFilters(sanitizedFilters);

    startTransition(() => {
      router.replace(buildUrl(pathname, nextQueryString), { scroll: false });
    });
  }, [canUseVipEarlyAccessFilter, fetchCatalogLots, fetchLots, filters, pathname, router, startTransition]);

  const applyFilters = useCallback(
    (nextFilters: Filters) => {
      const sanitizedFilters = sanitizeFilters(nextFilters, {
        canUseVipEarlyAccessFilter,
      });

      setFilters(sanitizedFilters);
      void fetchLots(sanitizedFilters);

      const queryString = serializeFilters(sanitizedFilters, false);

      startTransition(() => {
        router.replace(buildUrl(pathname, queryString), { scroll: false });
      });
    },
    [canUseVipEarlyAccessFilter, fetchLots, pathname, router],
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
          canUseVipEarlyAccessFilter={canUseVipEarlyAccessFilter}
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
                regionSpec={lot.vehicle.regionSpec}
                imageUrl={lot.imageUrl}
                currentBid={lot.currentBidAed}
                marketPrice={lot.marketPriceAed ?? undefined}
                buyNowPrice={lot.buyNowPrice ?? undefined}
                status={lot.state}
                totalBids={lot.totalBids}
                showVipEarlyAccessBadge={lot.showVipEarlyAccessBadge}
                endTime={
                  isLiveAuctionState(lot.state)
                    ? lot.endsAt ?? lot.startsAt ?? new Date().toISOString()
                    : lot.startsAt ?? lot.endsAt ?? new Date().toISOString()
                }
                display={display}
                showWishlistControl
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
