"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LotCard } from "@/components/auction/LotCard";
import { LotRow } from "@/components/auction/LotRow";
import { ApiError, api } from "@/src/lib/api-client";
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
  lotNumber: string;
  vin: string;
  year: number;
  mileageKm: number;
  imageUrl: string;
  imageCount: number;
  currentBidAed: number;
  buyNowPrice?: number | null;
  startsAt: string | null;
  endsAt: string | null;
  totalBids: number;
  showVipEarlyAccessBadge?: boolean;
  conditionGrade: "A" | "B" | "C" | "D";
  primaryDamage: string;
  titleStatus: string;
  tireCondition: number | null;
  engine: string;
  transmission: string;
  driveType: string;
  fuelType: string;
  startCode: string;
  numberOfKeys: number;
  warrantyStatus: string;
  serviceHistory: string;
  estimatedValue: number | null;
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
    vin?: string;
    bodyType?: string;
    fuelType?: string;
    regionSpec?: string;
    images?: string[];
    conditionGrade?: "A" | "B" | "C" | "D";
    primaryDamage?: string | null;
    titleStatus?: string | null;
    tireCondition?: number | null;
    engine?: string | null;
    transmission?: string | null;
    driveType?: string | null;
    numberOfKeys?: number | null;
    warrantyStatus?: string | null;
    serviceHistory?: string | null;
    startCode?: string | null;
    estimatedValue?: number | null;
  };
};

type BuyerDashboardResponse = {
  vipStatus?: {
    tier?: BuyerTier;
  };
};

type Filters = {
  vipEarlyAccess: string;
  minYear: string;
  maxYear: string;
  brand: string;
  model: string;
  status: string;
  minPrice: string;
  maxPrice: string;
  region: string;
  bodyType: string;
  fuelType: string;
  maxMileage: string;
  sort: string;
};

type QuickFilterId =
  | "RUN_AND_DRIVE"
  | "GCC_SPEC"
  | "BUY_NOW"
  | "GRADE_AB"
  | "AUCTION_TODAY"
  | "UNDER_50K";

const DEFAULT_FILTERS: Filters = {
  vipEarlyAccess: "",
  minYear: "",
  maxYear: "",
  brand: "",
  model: "",
  status: "",
  minPrice: "",
  maxPrice: "",
  region: "",
  bodyType: "",
  fuelType: "",
  maxMileage: "",
  sort: "ending_soon",
};

const DEFAULT_QUICK_FILTERS: Record<QuickFilterId, boolean> = {
  RUN_AND_DRIVE: false,
  GCC_SPEC: false,
  BUY_NOW: false,
  GRADE_AB: false,
  AUCTION_TODAY: false,
  UNDER_50K: false,
};

function getLotNumber(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function sanitizeYear(value: string): string {
  if (!value.trim()) {
    return "";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "";
  }

  return String(Math.min(2026, Math.max(2000, Math.trunc(numeric))));
}

function sanitizeFilters(
  filters: Filters,
  options: {
    canUseVipEarlyAccessFilter: boolean;
  },
): Filters {
  const next = {
    ...filters,
    minYear: sanitizeYear(filters.minYear),
    maxYear: sanitizeYear(filters.maxYear),
  };

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

  if (next.minYear && next.maxYear && Number(next.minYear) > Number(next.maxYear)) {
    next.maxYear = "";
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
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function buildApiQuery(
  filters: Filters,
  options: {
    canUseVipEarlyAccessFilter: boolean;
  },
): Record<string, string> | undefined {
  const query: Record<string, string> = {};

  if (options.canUseVipEarlyAccessFilter && filters.vipEarlyAccess === "active") {
    query.vipEarlyAccess = "active";
  }

  if (filters.maxYear) {
    query.maxYear = filters.maxYear;
  }

  return Object.keys(query).length > 0 ? query : undefined;
}

function mapApiAuctionToLot(auction: ApiAuction): Lot | null {
  if (!auction.id) {
    return null;
  }

  const vehicle = auction.vehicle ?? {};
  const year = Number(vehicle.year ?? 0);
  const brand = String(vehicle.brand ?? "").trim();
  const model = String(vehicle.model ?? "").trim();
  const title = [year > 0 ? String(year) : "", brand, model].filter(Boolean).join(" ");

  return {
    id: String(auction.id),
    state: (auction.state as Lot["state"] | undefined) ?? "SCHEDULED",
    title: title || `Lot ${getLotNumber(String(auction.id))}`,
    lotNumber: getLotNumber(String(auction.id)),
    vin: String(vehicle.vin ?? ""),
    year,
    mileageKm: Number(vehicle.mileage ?? 0),
    imageUrl:
      Array.isArray(vehicle.images) && typeof vehicle.images[0] === "string" && vehicle.images[0].trim().length > 0
        ? vehicle.images[0]
        : "/vehicle-photo.svg",
    imageCount: Array.isArray(vehicle.images) ? vehicle.images.length : 0,
    currentBidAed: Number(auction.currentPrice ?? auction.startingPrice ?? 0),
    buyNowPrice: auction.buyNowPrice === null || auction.buyNowPrice === undefined ? null : Number(auction.buyNowPrice),
    startsAt: auction.startsAt ?? null,
    endsAt: auction.endsAt ?? null,
    totalBids: Number(auction.totalBids ?? 0),
    showVipEarlyAccessBadge: auction.showVipEarlyAccessBadge === true,
    conditionGrade: vehicle.conditionGrade ?? "D",
    primaryDamage: String(vehicle.primaryDamage ?? "None"),
    titleStatus: String(vehicle.titleStatus ?? "—"),
    tireCondition: vehicle.tireCondition == null ? null : Number(vehicle.tireCondition),
    engine: String(vehicle.engine ?? "—"),
    transmission: String(vehicle.transmission ?? "—"),
    driveType: String(vehicle.driveType ?? "—"),
    fuelType: String(vehicle.fuelType ?? "—"),
    startCode: String(vehicle.startCode ?? "Run & Drive"),
    numberOfKeys: Number(vehicle.numberOfKeys ?? 0),
    warrantyStatus: String(vehicle.warrantyStatus ?? "NONE"),
    serviceHistory: String(vehicle.serviceHistory ?? ""),
    estimatedValue: vehicle.estimatedValue == null ? null : Number(vehicle.estimatedValue),
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

function filterAndSortLots(source: Lot[], filters: Filters): Lot[] {
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

    if (filters.maxYear && lot.year > Number(filters.maxYear)) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    if (filters.sort === "newest") {
      return new Date(right.startsAt ?? 0).getTime() - new Date(left.startsAt ?? 0).getTime();
    }

    if (filters.sort === "price_asc") {
      return left.currentBidAed - right.currentBidAed;
    }

    if (filters.sort === "price_desc") {
      return right.currentBidAed - left.currentBidAed;
    }

    if (filters.sort === "mileage_asc") {
      return left.mileageKm - right.mileageKm;
    }

    return new Date(left.endsAt ?? left.startsAt ?? 0).getTime() - new Date(right.endsAt ?? right.startsAt ?? 0).getTime();
  });
}

function isSameDubaiDay(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());

  return formatter.format(new Date(value)) === today;
}

function applyQuickFilters(source: Lot[], quickFilters: Record<QuickFilterId, boolean>): Lot[] {
  return source.filter((lot) => {
    if (quickFilters.RUN_AND_DRIVE && lot.startCode !== "Run & Drive") {
      return false;
    }

    if (quickFilters.GCC_SPEC && lot.vehicle.regionSpec !== "GCC") {
      return false;
    }

    if (quickFilters.BUY_NOW && !(typeof lot.buyNowPrice === "number" && lot.buyNowPrice > 0)) {
      return false;
    }

    if (quickFilters.GRADE_AB && !["A", "B"].includes(lot.conditionGrade)) {
      return false;
    }

    if (quickFilters.AUCTION_TODAY && !isSameDubaiDay(lot.startsAt)) {
      return false;
    }

    if (quickFilters.UNDER_50K && lot.mileageKm > 50_000) {
      return false;
    }

    return true;
  });
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
  const [quickFilters, setQuickFilters] = useState<Record<QuickFilterId, boolean>>(DEFAULT_QUICK_FILTERS);
  const [lots, setLots] = useState<Lot[]>([]);
  const [catalogLots, setCatalogLots] = useState<Lot[]>([]);
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

  const brandOptions = useMemo(() => Array.from(brandToModels.keys()).sort((left, right) => left.localeCompare(right)), [brandToModels]);

  const modelOptions = useMemo(() => {
    if (!filters.brand) {
      return [];
    }

    return Array.from(brandToModels.get(filters.brand) ?? []).sort((left, right) => left.localeCompare(right));
  }, [brandToModels, filters.brand]);

  const fetchLots = useCallback(
    async (nextFilters: Filters) => {
      setLoading(true);

      try {
        const query = buildApiQuery(nextFilters, {
          canUseVipEarlyAccessFilter,
        });
        const data = await api.auctions.list<{
          auctions?: ApiAuction[];
          lots?: ApiAuction[];
        }>(query, {
          cache: "no-store",
        });
        const mappedLots = (data.auctions ?? data.lots ?? [])
          .map(mapApiAuctionToLot)
          .filter((lot): lot is Lot => lot !== null);

        setLots(filterAndSortLots(mappedLots, nextFilters));
      } catch {
        setLots([]);
      } finally {
        setLoading(false);
      }
    },
    [canUseVipEarlyAccessFilter],
  );

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
    [canUseVipEarlyAccessFilter, fetchLots, pathname, router, startTransition],
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
    setQuickFilters(DEFAULT_QUICK_FILTERS);
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

  const visibleLots = useMemo(() => applyQuickFilters(lots, quickFilters), [lots, quickFilters]);

  const quickFilterPills = [
    { id: "RUN_AND_DRIVE" as const, label: "Run & Drive" },
    { id: "GCC_SPEC" as const, label: "GCC Spec" },
    { id: "BUY_NOW" as const, label: "Buy Now" },
    { id: "GRADE_AB" as const, label: "Grade A-B" },
    { id: "AUCTION_TODAY" as const, label: "Auction today" },
    { id: "UNDER_50K" as const, label: "Under 50k km" },
  ];

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
            : "Close filters"
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
          total={visibleLots.length}
          loading={loading || isPending}
          onChange={(value) => updateFilter("sort", value)}
          locale={display.locale}
        />

        <div className={styles.quickFilterRow}>
          {quickFilterPills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`${styles.quickFilterPill} ${quickFilters[pill.id] ? styles.quickFilterPillActive : ""}`}
              onClick={() =>
                setQuickFilters((current) => ({
                  ...current,
                  [pill.id]: !current[pill.id],
                }))
              }
            >
              {pill.label}
            </button>
          ))}
        </div>

        <ActiveFilters
          filters={filters}
          onClear={(key) => clearFilter(key as keyof Filters)}
          onClearAll={clearAll}
          display={display}
        />

        {loading ? (
          <>
            <div className={styles.tableShell}>
              <div className={styles.tableHeader}>
                <span>Photo</span>
                <span>Vehicle</span>
                <span>Condition</span>
                <span>Details</span>
                <span>Auction / Status</span>
              </div>
              <div className={styles.tableSkeletonList}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className={styles.tableSkeletonRow} />
                ))}
              </div>
            </div>

            <div className={styles.lotCards}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={styles.cardSkeleton} />
              ))}
            </div>
          </>
        ) : visibleLots.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{isRu ? "Лоты не найдены" : "No lots found"}</p>
            <p className={styles.emptySub}>{isRu ? "Попробуйте изменить фильтры." : "Try adjusting your filters."}</p>
            <button type="button" className={styles.clearBtn} onClick={clearAll}>
              {isRu ? "Сбросить фильтры" : "Clear all filters"}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.tableShell}>
              <div className={styles.tableHeader}>
                <span>Photo</span>
                <span>Vehicle</span>
                <span>Condition</span>
                <span>Details</span>
                <span>Auction / Status</span>
              </div>

              <div className={styles.lotTable}>
                {visibleLots.map((lot) => (
                  <LotRow key={lot.id} lot={lot} display={display} />
                ))}
              </div>
            </div>

            <div className={styles.lotCards}>
              {visibleLots.map((lot) => (
                <LotCard
                  key={lot.id}
                  lotId={lot.id}
                  title={lot.title}
                  year={lot.year}
                  mileage={lot.mileageKm}
                  regionSpec={lot.vehicle.regionSpec}
                  imageUrl={lot.imageUrl}
                  currentBid={lot.currentBidAed}
                  marketPrice={lot.estimatedValue ?? undefined}
                  buyNowPrice={lot.buyNowPrice ?? undefined}
                  status={lot.state}
                  totalBids={lot.totalBids}
                  showVipEarlyAccessBadge={lot.showVipEarlyAccessBadge}
                  endTime={lot.state === "LIVE" || lot.state === "EXTENDED" ? lot.endsAt ?? new Date().toISOString() : lot.startsAt ?? new Date().toISOString()}
                  display={display}
                  showWishlistControl
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
