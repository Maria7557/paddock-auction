"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
import { isScheduledAuctionState, isScheduledWithoutBids } from "@/src/lib/auction-display";
import { toIntlLocale, withLocalePath } from "@/src/i18n/routing";
import { formatAed } from "@/src/lib/utils";
import type { DisplaySettings } from "@/src/lib/money";

import type { LotDetail } from "../types";
import styles from "./BidPanel.module.css";

type Props = {
  lot: LotDetail;
  totalBids?: number;
  display: DisplaySettings;
};

type Outcome = { type: "success" | "error" | "info"; msg: string } | null;
type BuyerTier = "STANDARD" | "VIP";

type AuthMeResponse = {
  user?: {
    role?: string;
    status?: string;
    kycVerified?: boolean;
    companyUsers?: Array<{
      company?: {
        buyerTier?: BuyerTier | null;
        status?: string | null;
      } | null;
    }>;
  };
};

type BuyerDashboardResponse = {
  depositStatus?: {
    hasRequiredDeposit?: boolean;
  };
};

type ViewerState = {
  checked: boolean;
  authenticated: boolean;
  isBuyer: boolean;
  userStatus: string | null;
  companyStatus: string | null;
  kycVerified: boolean;
  hasRequiredDeposit: boolean;
};

const DEFAULT_VIEWER_STATE: ViewerState = {
  checked: false,
  authenticated: false,
  isBuyer: false,
  userStatus: null,
  companyStatus: null,
  kycVerified: false,
  hasRequiredDeposit: false,
};

function isActiveStatus(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === "ACTIVE";
}

function getStatusMeta(lot: LotDetail, locale: DisplaySettings["locale"]): { label: string; dotClass: string; dateLabel: string } {
  const isRu = locale === "ru";
  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const targetDate = new Date(isLive ? lot.endsAt : lot.startsAt);

  return {
    label: isLive ? (isRu ? "LIVE" : "LIVE") : isScheduledAuctionState(lot.state) ? (isRu ? "Pre-Bid" : "Pre-Bid") : isRu ? "Closed" : "Closed",
    dotClass: isLive ? styles.statusDotLive : isScheduledAuctionState(lot.state) ? styles.statusDotScheduled : styles.statusDotClosed,
    dateLabel: targetDate.toLocaleString(toIntlLocale(locale), {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export function BidPanel({ lot, totalBids = 0, display }: Props) {
  const router = useRouter();
  const isRu = display.locale === "ru";
  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const isScheduled = isScheduledAuctionState(lot.state);
  const isClosed = !isLive && !isScheduled;
  const [viewer, setViewer] = useState<ViewerState>(DEFAULT_VIEWER_STATE);
  const [livePrice, setLivePrice] = useState(lot.currentBidAed);
  const [manualBidAed, setManualBidAed] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buyNowSuccess, setBuyNowSuccess] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const clearOutcome = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasVisibleScheduledBid = !isScheduledWithoutBids(lot.state, livePrice);
  const nextBidAmount = isLive ? livePrice + lot.minStepAed : livePrice > 0 ? livePrice + lot.minStepAed : Math.max(lot.minStepAed, 1_000);
  const manualBidAmount = Number(manualBidAed);
  const canUseManualBid = Number.isFinite(manualBidAmount) && manualBidAmount > 0;
  const canBid =
    viewer.authenticated &&
    viewer.isBuyer &&
    isActiveStatus(viewer.userStatus) &&
    isActiveStatus(viewer.companyStatus) &&
    viewer.kycVerified &&
    viewer.hasRequiredDeposit;
  const statusMeta = getStatusMeta(lot, display.locale);
  const gateHref = viewer.authenticated ? withLocalePath("/wallet", display.locale) : withLocalePath("/login", display.locale);
  const progressPct = lot.estimatedValue ? Math.min(100, Math.round((livePrice / lot.estimatedValue) * 100)) : 0;
  const saleRows = [
    {
      label: isRu ? "Дата аукциона" : "Auction date",
      value: new Date(lot.startsAt).toLocaleString(toIntlLocale(display.locale), {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
      tone: "positive",
    },
    { label: isRu ? "Часовой пояс" : "Timezone", value: isRu ? "Дубай · GST" : "Dubai Time · GST" },
    { label: isRu ? "Локация" : "Location", value: lot.location },
    { label: isRu ? "Продавец" : "Seller", value: lot.sellerName },
    { label: isRu ? "Документ" : "Title doc", value: lot.titleStatus },
    { label: isRu ? "Номер лота" : "Lot number", value: `#${lot.lotNumber}` },
  ];

  useEffect(() => {
    setLivePrice(lot.currentBidAed);
    setManualBidAed("");
    setBuyNowSuccess(false);
  }, [lot.auctionId, lot.currentBidAed]);

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const data = await api.auctions.live(lot.auctionId, {
          cache: "no-store",
        });

        if (typeof data.currentPrice === "number") {
          setLivePrice(data.currentPrice);
        }
      } catch {
        // Keep current UI state during transient polling failures.
      }
    }, 3_000);

    return () => clearInterval(timer);
  }, [isLive, lot.auctionId]);

  useEffect(() => {
    let active = true;

    async function loadViewer(): Promise<void> {
      try {
        const authPayload = await api.auth.me<AuthMeResponse>();

        if (!active) {
          return;
        }

        const user = authPayload.user;
        const company = user?.companyUsers?.[0]?.company ?? null;
        const nextState: ViewerState = {
          checked: true,
          authenticated: true,
          isBuyer: user?.role === "BUYER",
          userStatus: user?.status ?? null,
          companyStatus: company?.status ?? null,
          kycVerified: user?.kycVerified === true,
          hasRequiredDeposit: false,
        };

        if (nextState.isBuyer) {
          try {
            const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>({
              cache: "no-store",
            });

            if (!active) {
              return;
            }

            setViewer({
              ...nextState,
              hasRequiredDeposit: dashboard.depositStatus?.hasRequiredDeposit === true,
            });
            return;
          } catch (error) {
            if (error instanceof ApiError && error.statusCode === 401) {
              setViewer({
                ...DEFAULT_VIEWER_STATE,
                checked: true,
              });
              return;
            }
          }
        }

        setViewer(nextState);
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.statusCode === 401) {
          setViewer({
            ...DEFAULT_VIEWER_STATE,
            checked: true,
          });
          return;
        }

        setViewer({
          ...DEFAULT_VIEWER_STATE,
          checked: true,
          authenticated: true,
        });
      }
    }

    void loadViewer();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clearOutcome.current) {
        clearTimeout(clearOutcome.current);
      }
    };
  }, []);

  const showOutcome = useCallback((next: Outcome) => {
    setOutcome(next);

    if (clearOutcome.current) {
      clearTimeout(clearOutcome.current);
    }

    clearOutcome.current = setTimeout(() => setOutcome(null), 5_000);
  }, []);

  const placeBid = useCallback(
    async (amount: number) => {
      if (!canBid) {
        router.push(gateHref);
        return;
      }

      setBusy(true);

      try {
        const idempotencyKey = `bid-${lot.auctionId}-${amount}-${Date.now()}`;
        await api.bids.place(lot.auctionId, amount, idempotencyKey);
        setLivePrice(amount);
        setManualBidAed("");
        showOutcome({
          type: "success",
          msg: isRu ? `Ставка принята: ${formatAed(amount)}` : `Bid placed: ${formatAed(amount)}`,
        });
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          router.push(withLocalePath("/login", display.locale));
          return;
        }

        showOutcome({
          type: "error",
          msg: getApiErrorMessage(error, isRu ? "Не удалось отправить ставку." : "Unable to place bid."),
        });
      } finally {
        setBusy(false);
      }
    },
    [canBid, display.locale, gateHref, isRu, lot.auctionId, router, showOutcome],
  );

  const handleBuyNow = useCallback(async () => {
    if (!canBid) {
      router.push(gateHref);
      return;
    }

    setBusy(true);

    try {
      const payload = await api.auctions.buyNow<{ message?: string }>(lot.auctionId);
      setBuyNowSuccess(true);
      showOutcome({
        type: "success",
        msg: payload.message ?? (isRu ? "Покупка подтверждена." : "Purchase confirmed."),
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        router.push(withLocalePath("/login", display.locale));
        return;
      }

      showOutcome({
        type: "error",
        msg: getApiErrorMessage(error, isRu ? "Не удалось выполнить Buy Now." : "Buy Now failed."),
      });
    } finally {
      setBusy(false);
    }
  }, [canBid, display.locale, gateHref, isRu, lot.auctionId, router, showOutcome]);

  const toggleWatchlist = useCallback(async () => {
    setSaved((current) => !current);

    try {
      await api.buyer.wishlist.toggle(lot.auctionId);
    } catch (error) {
      setSaved((current) => !current);

      if (error instanceof ApiError && error.statusCode === 401) {
        router.push(withLocalePath("/login", display.locale));
      }
    }
  }, [display.locale, lot.auctionId, router]);

  const statusSummary = useMemo(() => {
    if (isLive) {
      return {
        title: isRu ? "Текущая ставка" : "Current bid",
        value: formatAed(livePrice),
        subtitle: `${isRu ? "Мин. следующий bid" : "Min next bid"} ${formatAed(nextBidAmount)}`,
      };
    }

    if (isScheduled) {
      return {
        title: isRu ? "PRE-BID статус" : "PRE-BID STATUS",
        value: isRu ? "Pre-Bid" : "Pre-Bid",
        subtitle: hasVisibleScheduledBid
          ? isRu
            ? `${totalBids} ставок уже размещено.`
            : `${totalBids} bid${totalBids === 1 ? "" : "s"} already placed.`
          : isRu
            ? "Пока нет ставок. Разместите первую pre-bid."
            : "No bids yet. Place the first pre-bid.",
      };
    }

    return {
      title: isRu ? "Финальная цена" : "Final price",
      value: formatAed(livePrice),
      subtitle: isRu ? "Аукцион закрыт" : "Auction closed",
    };
  }, [hasVisibleScheduledBid, isLive, isRu, isScheduled, livePrice, nextBidAmount, totalBids]);

  return (
    <div className={styles.sidebarStack}>
      <section className={styles.panel}>
        <div className={styles.statusBar}>
          <span className={styles.statusLeft}>
            <span className={`${styles.statusDot} ${statusMeta.dotClass}`} aria-hidden />
            <span className={styles.statusLabel}>{statusMeta.label}</span>
          </span>
          <span className={styles.statusDate}>{statusMeta.dateLabel}</span>
        </div>

        <div className={styles.panelBody}>
          {isScheduled ? (
            <div className={styles.summaryGrid}>
              <div>
                <p className={styles.summaryLabel}>{statusSummary.title}</p>
                <p className={styles.summaryValue}>{statusSummary.value}</p>
                <p className={styles.summarySub}>{statusSummary.subtitle}</p>
              </div>
              {lot.buyNowAed > 0 ? (
                <div>
                  <p className={styles.summaryLabel}>BUY NOW</p>
                  <p className={styles.summaryBuyNow}>{formatAed(lot.buyNowAed)}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={styles.priceHero}>
              <p className={styles.summaryLabel}>{statusSummary.title}</p>
              <p className={`${styles.summaryValue} ${styles.summaryValueLive}`}>{statusSummary.value}</p>
              <p className={styles.summarySub}>{statusSummary.subtitle}</p>
            </div>
          )}

          {isLive ? (
            <>
              <Link href={`/auctions/live/${lot.auctionId}`} className={`${styles.actionButton} ${styles.actionButtonPrimary}`}>
                {isRu ? "Войти в live room" : "Enter Live Room"}
              </Link>

              <div className={styles.bidComposer}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={nextBidAmount}
                  step={lot.minStepAed}
                  value={manualBidAed}
                  onChange={(event) => setManualBidAed(event.target.value)}
                  className={styles.bidInput}
                  placeholder={formatAed(nextBidAmount)}
                />
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  onClick={() => void placeBid(canUseManualBid ? manualBidAmount : nextBidAmount)}
                  disabled={busy}
                >
                  {busy ? (isRu ? "Отправка..." : "Submitting...") : isRu ? "Сделать ставку" : "Place bid"}
                </button>
              </div>
            </>
          ) : null}

          {isScheduled ? (
            <>
              <div className={styles.bidComposer}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={nextBidAmount}
                  step={lot.minStepAed}
                  value={manualBidAed}
                  onChange={(event) => setManualBidAed(event.target.value)}
                  className={styles.bidInput}
                  placeholder={formatAed(nextBidAmount)}
                />
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  onClick={() => void placeBid(canUseManualBid ? manualBidAmount : nextBidAmount)}
                  disabled={busy}
                >
                  {busy ? (isRu ? "Отправка..." : "Submitting...") : isRu ? "Разместить pre-bid" : "Place pre-bid"}
                </button>
              </div>

              {lot.buyNowAed > 0 ? (
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  onClick={() => void handleBuyNow()}
                  disabled={busy || buyNowSuccess}
                >
                  {buyNowSuccess
                    ? isRu
                      ? "Покупка подтверждена"
                      : "Purchase confirmed"
                    : `Buy Now — ${formatAed(lot.buyNowAed)}`}
                </button>
              ) : null}
            </>
          ) : null}

          {!isClosed ? (
            <button type="button" className={styles.actionButton} onClick={() => void toggleWatchlist()}>
              {saved ? (isRu ? "В избранном" : "Saved to watchlist") : isRu ? "Добавить в избранное" : "Add to watchlist"}
            </button>
          ) : null}

          {isClosed ? <p className={styles.closedNote}>{isRu ? "Аукцион закрыт" : "Auction closed"}</p> : null}

          {!isClosed ? (
            <div className={styles.depositNote}>
              {viewer.checked && !canBid
                ? isRu
                  ? "Для участия нужен возвратный депозит AED 5,000 и активный buyer-аккаунт."
                  : "A refundable AED 5,000 deposit and an active buyer account are required to bid."
                : isRu
                  ? "Возвратный депозит AED 5,000 остаётся активным на время торгов."
                  : "The refundable AED 5,000 deposit stays reserved while you are bidding."}
            </div>
          ) : null}

          {outcome ? (
            <div
              className={`${styles.feedback} ${
                outcome.type === "success" ? styles.feedbackSuccess : outcome.type === "error" ? styles.feedbackError : styles.feedbackInfo
              }`}
            >
              {outcome.msg}
            </div>
          ) : null}

          {!isClosed ? (
            <div className={styles.howToBid}>
              <p className={styles.howToBidTitle}>{isRu ? "Как начать bidding" : "How to Start Bidding"}</p>
              <ol className={styles.howToBidList}>
                <li>{isRu ? "Создайте buyer-аккаунт и завершите проверку." : "Create your buyer account and complete verification."}</li>
                <li>{isRu ? "Пополните возвратный депозит AED 5,000." : "Add the refundable AED 5,000 deposit."}</li>
                <li>{isRu ? "Размещайте pre-bid или входите в live room." : "Place pre-bids or enter the live room."}</li>
              </ol>

              {viewer.checked && !canBid ? (
                <Link href={gateHref} className={styles.helperLink}>
                  {viewer.authenticated
                    ? isRu
                      ? "Перейти к депозиту"
                      : "Go to deposit"
                    : isRu
                      ? "Войти, чтобы начать"
                      : "Sign in to begin"}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {lot.estimatedValue ? (
        <section className={styles.panel}>
          <div className={styles.simplePanelBody}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>{isRu ? "Оценочная стоимость" : "Estimated value"}</span>
              <span className={styles.metricValue}>{formatAed(lot.estimatedValue)}</span>
            </div>

            <div className={styles.progressTrack} aria-hidden>
              <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>

            <p className={styles.metricSub}>
              {isRu
                ? `Текущая ставка составляет ${progressPct}% от оценочной стоимости`
                : `Current bid is ${progressPct}% of estimated value`}
            </p>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{isRu ? "Информация о продаже" : "Sale information"}</h3>
        </div>
        <div className={styles.simplePanelBody}>
          {saleRows.map((row) => (
            <div key={row.label} className={styles.saleRow}>
              <span className={styles.saleLabel}>{row.label}</span>
              <span className={`${styles.saleValue} ${row.tone === "positive" ? styles.saleValuePositive : ""}`.trim()}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
