"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { IconClock, IconTag } from "@/components/ui/icons";
import { SellerDecisionCard } from "@/src/components/seller/SellerDecisionCard";
import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
import type { SellerPendingDecisionItem, SellerPendingDecisionResponse } from "@/src/types/auction";

const EMPTY_RESPONSE: SellerPendingDecisionResponse = {
  pending: [],
};

function normalizePendingResponse(
  payload: Partial<SellerPendingDecisionResponse> | null | undefined,
): SellerPendingDecisionResponse {
  return {
    pending: Array.isArray(payload?.pending) ? payload.pending : [],
  };
}

export default function SellerDecisionsPage() {
  const router = useRouter();
  const [data, setData] = useState<SellerPendingDecisionResponse>(EMPTY_RESPONSE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<{
    auctionId: string;
    action: "accept" | "decline";
  } | null>(null);

  const redirectToLogin = useCallback(() => {
    router.replace("/login?next=/seller/decisions");
  }, [router]);

  const loadPendingDecisions = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      setError(null);

      const response = await api.seller.decisions.pending<SellerPendingDecisionResponse>({
        cache: "no-store",
      });

      setData(normalizePendingResponse(response));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        redirectToLogin();
        return;
      }

      setError(getApiErrorMessage(requestError, "Unable to load pending decisions right now."));
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, [redirectToLogin]);

  const handleDecision = useCallback(async (auctionId: string, decision: "accept" | "decline") => {
    setBusyDecision({
      auctionId,
      action: decision,
    });

    try {
      setError(null);

      await api.seller.auctions.decision(
        auctionId,
        { decision },
        {
          cache: "no-store",
        },
      );

      await loadPendingDecisions(false);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        redirectToLogin();
        return;
      }

      setError(getApiErrorMessage(requestError, "Unable to save your decision right now."));
    } finally {
      setBusyDecision(null);
    }
  }, [loadPendingDecisions, redirectToLogin]);

  useEffect(() => {
    document.title = "Decisions Required";
    void loadPendingDecisions();
  }, [loadPendingDecisions]);

  return (
    <section className="decisionsPage">
      <header className="pageHeader">
        <div className="eyebrow eyebrow-green">Seller Workspace</div>
        <h1>Decisions Required</h1>
        <p>Accept or decline winning bids before each seller decision deadline expires.</p>
      </header>

      {error ? (
        <div className="inline-note tone-error" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <section className="stateCard" aria-live="polite">
          <span className="stateIcon spinnerIcon" aria-hidden="true">
            <IconClock size={22} strokeWidth={2} />
          </span>
          <div className="stateCopy">
            <h2>Loading...</h2>
            <p>Fetching seller decisions.</p>
          </div>
        </section>
      ) : data.pending.length === 0 ? (
        <section className="stateCard">
          <span className="stateIcon" aria-hidden="true">
            <IconTag size={22} strokeWidth={2} />
          </span>
          <div className="stateCopy">
            <h2>No pending decisions</h2>
            <p>Lots that need seller approval will appear here after the auction closes.</p>
          </div>
          <Link href="/seller/auctions" className="btn btn-outline">
            View Auctions
          </Link>
        </section>
      ) : (
        <section className="section">
          <div className="sectionTitle">Awaiting Seller Decision</div>
          <div className="decisionGrid">
            {data.pending.map((item: SellerPendingDecisionItem) => (
              <SellerDecisionCard
                key={item.auctionId}
                {...item}
                busyAction={
                  busyDecision?.auctionId === item.auctionId
                    ? busyDecision.action
                    : null
                }
                onAccept={(auctionId) => handleDecision(auctionId, "accept")}
                onDecline={(auctionId) => handleDecision(auctionId, "decline")}
              />
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .decisionsPage {
          display: grid;
          gap: var(--space-4);
        }

        .pageHeader {
          display: grid;
          gap: 10px;
        }

        .pageHeader h1 {
          margin: 0;
          font-size: clamp(32px, 5vw, 48px);
          line-height: 0.98;
          color: var(--ink-primary);
        }

        .pageHeader p {
          margin: 0;
          max-width: 700px;
          font-size: 16px;
          color: var(--ink-secondary);
        }

        .section {
          background: var(--bg-card);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-card);
          box-shadow: var(--shadow-soft);
          overflow: hidden;
        }

        .sectionTitle {
          padding: 16px 20px;
          font-size: 14px;
          font-weight: 700;
          color: var(--ink-primary);
          background: var(--bg-subtle);
          border-bottom: 1px solid var(--line-soft);
        }

        .decisionGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--space-3);
          padding: var(--space-3);
        }

        .stateCard {
          display: grid;
          justify-items: start;
          gap: 14px;
          padding: clamp(24px, 4vw, 36px);
          background: var(--bg-card);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-card);
          box-shadow: var(--shadow-soft);
        }

        .stateIcon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 999px;
          color: var(--green-600);
          background: var(--green-100);
        }

        .spinnerIcon {
          animation: spin 1s linear infinite;
        }

        .stateCopy {
          display: grid;
          gap: 8px;
        }

        .stateCopy h2 {
          margin: 0;
          font-size: 24px;
          color: var(--ink-primary);
        }

        .stateCopy p {
          margin: 0;
          max-width: 560px;
          color: var(--ink-secondary);
        }

        @media (max-width: 980px) {
          .decisionGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 740px) {
          .decisionGrid {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </section>
  );
}
