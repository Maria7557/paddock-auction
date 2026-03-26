"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";

import { BuyerShell } from "@/components/buyer/BuyerShell";
import { IconTag } from "@/components/ui/icons";
import { BidWatchCard } from "@/src/components/bidding/BidWatchCard";
import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
import type { MyBidsResponse } from "@/src/types/auction";

import styles from "./page.module.css";

type BuyerDashboardResponse = {
  metrics: {
    invoicesDue: number;
  };
  vipStatus: {
    tier: "STANDARD" | "VIP";
  };
};

type BuyerAuthResponse = {
  user?: {
    role?: string;
    email?: string;
    companyUsers?: Array<{
      companyId?: string;
      role?: string;
      company?: {
        name?: string;
        buyerTier?: "STANDARD" | "VIP" | null;
      } | null;
    }>;
  };
};

type ShellState = {
  companyName: string;
  companyEmail: string;
  tier: "STANDARD" | "VIP";
  invoicesDue: number;
};

const EMPTY_BIDS: MyBidsResponse = {
  live: [],
  scheduled: [],
  wonPending: [],
  wonInvoice: [],
  ended: [],
};

const DEFAULT_SHELL: ShellState = {
  companyName: "Buyer company",
  companyEmail: "buyer@fleetbid.ae",
  tier: "STANDARD",
  invoicesDue: 0,
};

function normalizeMyBidsResponse(payload: Partial<MyBidsResponse> | null | undefined): MyBidsResponse {
  return {
    live: Array.isArray(payload?.live) ? payload.live : [],
    scheduled: Array.isArray(payload?.scheduled) ? payload.scheduled : [],
    wonPending: Array.isArray(payload?.wonPending) ? payload.wonPending : [],
    wonInvoice: Array.isArray(payload?.wonInvoice) ? payload.wonInvoice : [],
    ended: Array.isArray(payload?.ended) ? payload.ended : [],
  };
}

function buildShellState(
  authResponse: BuyerAuthResponse,
  dashboard: BuyerDashboardResponse,
): ShellState {
  const companyUser =
    authResponse.user?.companyUsers?.find(
      (candidate) => candidate.role === "BUYER_BIDDER" && candidate.companyId,
    ) ??
    authResponse.user?.companyUsers?.[0] ??
    null;

  return {
    companyName: companyUser?.company?.name?.trim() || DEFAULT_SHELL.companyName,
    companyEmail: authResponse.user?.email?.trim() || DEFAULT_SHELL.companyEmail,
    tier:
      dashboard.vipStatus?.tier === "VIP" || companyUser?.company?.buyerTier === "VIP"
        ? "VIP"
        : "STANDARD",
    invoicesDue: dashboard.metrics?.invoicesDue ?? 0,
  };
}

export default function MyBidsPage() {
  const router = useRouter();
  const [shellState, setShellState] = useState<ShellState>(DEFAULT_SHELL);
  const [bids, setBids] = useState<MyBidsResponse>(EMPTY_BIDS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPageData(): Promise<void> {
    try {
      setError(null);

      const authResponse = await api.auth.me<BuyerAuthResponse>({ cache: "no-store" });

      if (authResponse.user?.role !== "BUYER") {
        router.replace("/login?next=/my-bids");
        return;
      }

      const [dashboard, myBids] = await Promise.all([
        api.buyer.dashboard<BuyerDashboardResponse>({ cache: "no-store" }),
        api.buyer.myBids<MyBidsResponse>({ cache: "no-store" }),
      ]);

      setShellState(buildShellState(authResponse, dashboard));
      setBids(normalizeMyBidsResponse(myBids));
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.statusCode === 401) {
        router.replace("/login?next=/my-bids");
        return;
      }

      setError(getApiErrorMessage(fetchError, "Unable to load your bids right now."));
    } finally {
      setIsLoading(false);
    }
  }

  const loadLiveSection = useEffectEvent(async () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }

    if (bids.live.length === 0) {
      return;
    }

    try {
      const nextBids = await api.buyer.myBids<MyBidsResponse>({ cache: "no-store" });

      setBids((current) => ({
        ...current,
        live: normalizeMyBidsResponse(nextBids).live,
      }));
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.statusCode === 401) {
        router.replace("/login?next=/my-bids");
      }
    }
  });

  const loadPageDataEvent = useEffectEvent(async () => {
    await loadPageData();
  });

  useEffect(() => {
    void loadPageDataEvent();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadLiveSection();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const hasAnyBids =
    bids.live.length > 0 ||
    bids.scheduled.length > 0 ||
    bids.wonPending.length > 0 ||
    bids.wonInvoice.length > 0 ||
    bids.ended.length > 0;

  return (
    <BuyerShell
      activePage="my-bids"
      invoicesDue={shellState.invoicesDue}
      companyName={shellState.companyName}
      companyEmail={shellState.companyEmail}
      tier={shellState.tier}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>My Bids</h1>
          <p>Track active auctions, pre-bids, and closed results from one watchlist.</p>
        </header>

        {isLoading ? (
          <section className={styles.loadingState}>
            <p>Loading your bids...</p>
          </section>
        ) : error ? (
          <section className={styles.errorState}>
            <div className={styles.errorCopy}>
              <h2>Unable to load your bids</h2>
              <p>{error}</p>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setIsLoading(true);
                void loadPageData();
              }}
            >
              Try Again
            </button>
          </section>
        ) : !hasAnyBids ? (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconTag size={24} strokeWidth={2} />
            </span>
            <h2>You haven&apos;t placed any bids yet</h2>
            <p>Start with live inventory or place pre-bids before the next auction opens.</p>
            <Link href="/auctions" className="btn btn-primary">
              Browse Auctions
            </Link>
          </section>
        ) : (
          <>
            {bids.live.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Active Auctions</h2>
                <div className={styles.cardGrid}>
                  {bids.live.map((item) => (
                    <BidWatchCard key={item.auctionId} mode="live" item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {bids.scheduled.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Pre-Bids</h2>
                <div className={styles.cardGrid}>
                  {bids.scheduled.map((item) => (
                    <BidWatchCard key={item.auctionId} mode="scheduled" item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {bids.wonPending.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Won · Awaiting Seller</h2>
                <div className={styles.cardGrid}>
                  {bids.wonPending.map((item) => (
                    <BidWatchCard key={item.auctionId} mode="won-pending" item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {bids.wonInvoice.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Won · Pay Now</h2>
                <div className={styles.cardGrid}>
                  {bids.wonInvoice.map((item) => (
                    <BidWatchCard key={item.auctionId} mode="won-invoice" item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {bids.ended.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Closed Auctions</h2>
                <div className={styles.cardGrid}>
                  {bids.ended.map((item) => (
                    <BidWatchCard key={item.auctionId} mode="ended" item={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </BuyerShell>
  );
}
