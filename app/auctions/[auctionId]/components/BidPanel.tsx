"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { toIntlLocale } from "@/src/i18n/routing";
import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
import {
  isLiveAuctionState,
  isScheduledAuctionState,
  isScheduledWithoutBids,
} from "@/src/lib/auction-display";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import { formatCountdown, savingPct, pad } from "@/src/lib/utils";

import type { LotDetail } from "../page";
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
  vipStatus?: {
    tier?: BuyerTier;
  };
};

type ViewerState = {
  checked: boolean;
  authenticated: boolean;
  isBuyer: boolean;
  userStatus: string | null;
  companyStatus: string | null;
  hasRequiredDeposit: boolean;
  buyerTier: BuyerTier | null;
};

const DEFAULT_VIEWER_STATE: ViewerState = {
  checked: false,
  authenticated: false,
  isBuyer: false,
  userStatus: null,
  companyStatus: null,
  hasRequiredDeposit: false,
  buyerTier: null,
};

function useCountdown(iso: string) {
  const [cd, setCd] = useState(() => formatCountdown(new Date(iso).getTime() - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(formatCountdown(new Date(iso).getTime() - Date.now()));
    }, 1_000);

    return () => clearInterval(timer);
  }, [iso]);

  return cd;
}

function hasBuyerAccessStatus(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length > 0 && normalized !== "BLOCKED" && normalized !== "REJECTED";
}

export function BidPanel({ lot, totalBids = 0, display }: Props) {
  const router = useRouter();
  const isRu = display.locale === "ru";

  const isLive = isLiveAuctionState(lot.state);
  const isScheduled = isScheduledAuctionState(lot.state);
  const isClosed = !isLive && !isScheduled;

  const countdownIso = isLive ? lot.endsAt : lot.startsAt;
  const cd = useCountdown(countdownIso);

  const [viewer, setViewer] = useState<ViewerState>(DEFAULT_VIEWER_STATE);
  const [livePrice, setLivePrice] = useState(lot.currentBidAed);
  const [visibleBidCount, setVisibleBidCount] = useState(totalBids);
  const [manualBidAed, setManualBidAed] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buyNowSuccess, setBuyNowSuccess] = useState(false);
  const clearOutcome = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLivePrice(lot.currentBidAed);
    setVisibleBidCount(totalBids);
    setManualBidAed("");
    setBuyNowSuccess(false);
  }, [lot.auctionId, lot.currentBidAed, totalBids]);

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const poll = setInterval(async () => {
      try {
        const data = await api.auctions.live(lot.auctionId, {
          cache: "no-store",
        });

        if (typeof data.currentPrice === "number" && data.currentPrice !== livePrice) {
          setLivePrice(data.currentPrice);
        }
      } catch {
        // Keep existing UI state on transient errors.
      }
    }, 3_000);

    return () => clearInterval(poll);
  }, [isLive, lot.auctionId, livePrice]);

  useEffect(() => {
    let active = true;

    async function loadViewer(): Promise<void> {
      try {
        const authPayload = await api.auth.me<AuthMeResponse>();

        if (!active) {
          return;
        }

        const user = authPayload.user;
        const primaryCompany = user?.companyUsers?.[0]?.company ?? null;
        const isBuyer = user?.role === "BUYER";
        const nextViewer: ViewerState = {
          checked: true,
          authenticated: true,
          isBuyer,
          userStatus: user?.status ?? null,
          companyStatus: primaryCompany?.status ?? null,
          hasRequiredDeposit: false,
          buyerTier: primaryCompany?.buyerTier ?? null,
        };

        if (!isBuyer) {
          setViewer(nextViewer);
          return;
        }

        try {
          const dashboard = await api.buyer.dashboard<BuyerDashboardResponse>();

          if (!active) {
            return;
          }

          setViewer({
            ...nextViewer,
            hasRequiredDeposit: dashboard.depositStatus?.hasRequiredDeposit === true,
            buyerTier: dashboard.vipStatus?.tier ?? nextViewer.buyerTier ?? "STANDARD",
          });
        } catch (dashboardError) {
          if (!active) {
            return;
          }

          if (dashboardError instanceof ApiError && dashboardError.statusCode === 401) {
            setViewer({
              ...DEFAULT_VIEWER_STATE,
              checked: true,
            });
            return;
          }

          setViewer(nextViewer);
        }
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

  const hasVisibleScheduledBid = !isScheduledWithoutBids(lot.state, livePrice);
  const canBid =
    viewer.authenticated &&
    viewer.isBuyer &&
    hasBuyerAccessStatus(viewer.userStatus) &&
    hasBuyerAccessStatus(viewer.companyStatus) &&
    viewer.hasRequiredDeposit;
  const gateHref = viewer.authenticated ? "/wallet" : "/login";
  const nextBid = livePrice + lot.minStepAed;
  const nextScheduledBid = livePrice > 0 ? livePrice + lot.minStepAed : null;
  const firstManualBidAmount = Number(manualBidAed);
  const hasValidManualBid = Number.isFinite(firstManualBidAmount) && firstManualBidAmount > 0;
  const marketReference = lot.actualCashValue > 0 ? lot.actualCashValue : 0;
  const buyNowSaving =
    lot.buyNowAed > 0 && marketReference > lot.buyNowAed ? savingPct(marketReference, lot.buyNowAed) : 0;
  const countdownDone = cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0;
  const showActionGate = !isClosed && viewer.checked && !canBid;
  const showHowToBid = !isClosed && viewer.checked && !canBid;
  const showBuyNow = lot.buyNowAed > 0;
  const gateSecondaryMessage = useMemo(() => {
    if (!viewer.authenticated) {
      return isRu
        ? "Войдите или зарегистрируйтесь, затем перейдите к депозиту."
        : "Sign in or register first, then continue to your deposit.";
    }

    if (!viewer.isBuyer) {
      return isRu
        ? "Только активные buyer-аккаунты с депозитом могут делать ставки."
        : "Only buyer accounts with a ready deposit can place bids.";
    }

    if (!hasBuyerAccessStatus(viewer.userStatus) || !hasBuyerAccessStatus(viewer.companyStatus)) {
      return isRu
        ? "Этот buyer-аккаунт сейчас недоступен для bidding."
        : "This buyer account is unavailable for bidding right now.";
    }

    return isRu
      ? "Как только депозит будет готов, вы сможете делать pre-bid и live ставки."
      : "Once your deposit is ready, you can place both pre-bids and live bids.";
  }, [isRu, viewer]);

  const countdownDate = new Date(countdownIso);
  const countdownDateLabel = countdownDate.toLocaleDateString(toIntlLocale(display.locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const countdownTimeLabel = countdownDate.toLocaleTimeString(toIntlLocale(display.locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  const placeBid = useCallback(
    async (amount: number) => {
      setBusy(true);

      try {
        const idempotencyKey = `bid-${lot.auctionId}-${amount}-${Date.now()}`;
        await api.bids.place(lot.auctionId, amount, idempotencyKey);

        showOutcome({
          type: "success",
          msg: isRu
            ? `Ставка принята: ${formatMoneyFromAed(amount, display)}`
            : `Bid placed: ${formatMoneyFromAed(amount, display)}`,
        });
        setLivePrice(amount);
        setVisibleBidCount((count) => count + 1);
        setManualBidAed("");
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          setViewer({
            ...DEFAULT_VIEWER_STATE,
            checked: true,
          });
          router.push("/login");
          return;
        }

        showOutcome({
          type: "error",
          msg: getApiErrorMessage(
            error,
            isRu ? "Не удалось отправить ставку. Попробуйте снова." : "Bid failed. Please try again.",
          ),
        });
      } finally {
        setBusy(false);
      }
    },
    [display, isRu, lot.auctionId, router, showOutcome],
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
        msg: payload.message ?? (isRu ? "Покупка подтверждена" : "Purchase confirmed"),
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        setViewer({
          ...DEFAULT_VIEWER_STATE,
          checked: true,
        });
        router.push("/login");
        return;
      }

      showOutcome({
        type: "error",
        msg: getApiErrorMessage(error, isRu ? "Buy Now не выполнен" : "Buy Now failed"),
      });
    } finally {
      setBusy(false);
    }
  }, [canBid, gateHref, isRu, lot.auctionId, router, showOutcome]);

  const handleFirstPreBid = useCallback(() => {
    if (!hasValidManualBid) {
      showOutcome({
        type: "error",
        msg: isRu ? "Введите сумму первой pre-bid ставки." : "Enter the first pre-bid amount.",
      });
      return;
    }

    void placeBid(firstManualBidAmount);
  }, [firstManualBidAmount, hasValidManualBid, isRu, placeBid, showOutcome]);

  const toggleWatchlist = useCallback(async () => {
    try {
      if (saved) {
        await api.buyer.wishlist.remove(lot.auctionId);
      } else {
        await api.buyer.wishlist.add(lot.auctionId);
      }

      setSaved(!saved);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        setViewer({
          ...DEFAULT_VIEWER_STATE,
          checked: true,
        });
        router.push("/login");
      }

      // Ignore watchlist errors in UI.
    }
  }, [lot.auctionId, router, saved]);

  return (
    <div id="bid-panel" className={styles.panel}>
      <div className={styles.statusRow}>
        {isLive && (
          <div className={styles.liveStatus}>
            <span className={styles.liveDot} aria-hidden />
            <span className={styles.liveLabel}>{isRu ? "АУКЦИОН В ЭФИРЕ" : "LIVE AUCTION"}</span>
          </div>
        )}
        {isScheduled && (
          <div className={styles.schedStatus}>
            <span>{isRu ? "СКОРО" : "UPCOMING"}</span>
          </div>
        )}
        {isClosed && (
          <div className={styles.closedStatus}>
            {lot.state === "PAYMENT_PENDING"
              ? isRu
                ? "Ожидается оплата"
                : "Payment Pending"
              : isRu
                ? "Аукцион завершён"
                : "Auction Ended"}
          </div>
        )}
      </div>

      {!isClosed && !countdownDone && (
        <div className={styles.countdown} aria-live="polite" aria-label={isRu ? "Таймер" : "Countdown"}>
          <div className={styles.cdLabel}>{isLive ? (isRu ? "До конца" : "Ends in") : isRu ? "До старта" : "Starts in"}</div>

          <div className={styles.cdTimer}>
            {cd.days > 0 && (
              <>
                <div className={styles.cdUnit}>
                  <div className={styles.cdNum}>{cd.days}</div>
                  <div className={styles.cdLbl}>{isRu ? "дн" : `day${cd.days !== 1 ? "s" : ""}`}</div>
                </div>
                <span className={styles.cdColon} aria-hidden>
                  :
                </span>
              </>
            )}

            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.hours)}</div>
              <div className={styles.cdLbl}>{isRu ? "ч" : "hrs"}</div>
            </div>
            <span className={styles.cdColon} aria-hidden>
              :
            </span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.minutes)}</div>
              <div className={styles.cdLbl}>{isRu ? "мин" : "min"}</div>
            </div>
            <span className={styles.cdColon} aria-hidden>
              :
            </span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.seconds)}</div>
              <div className={styles.cdLbl}>{isRu ? "сек" : "sec"}</div>
            </div>
          </div>

          <div className={styles.bidMeta}>
            {visibleBidCount > 0 ? (
              <span>
                {isRu
                  ? `${formatInteger(visibleBidCount, display.locale)} ставок`
                  : `${formatInteger(visibleBidCount, display.locale)} bid${visibleBidCount !== 1 ? "s" : ""}`}
              </span>
            ) : null}
            <span className={styles.scheduleMeta}>
              {isLive ? (isRu ? "Конец" : "Ends") : isRu ? "Старт" : "Starts"} {countdownDateLabel},{" "}
              {countdownTimeLabel} GST
            </span>
          </div>
        </div>
      )}

      {!isClosed && countdownDone && (
        <div className={styles.cdEnded}>
          {isLive ? (isRu ? "Приём ставок завершён" : "Bidding has closed") : isRu ? "Аукцион начинается…" : "Auction is starting…"}
        </div>
      )}

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <div className={styles.priceCell}>
            <div className={styles.priceLabel}>
              {isScheduled && !hasVisibleScheduledBid
                ? isRu
                  ? "Pre-Bid статус"
                  : "Pre-Bid status"
                : isRu
                  ? "Текущая ставка"
                  : "Current bid"}
            </div>
            {isScheduled && !hasVisibleScheduledBid ? (
              <>
                <div className={styles.currentPrice}>{isRu ? "Pre-Bid" : "Pre-Bid"}</div>
                <div className={styles.minIncrement}>
                  {isRu
                    ? "Пока нет ставок. Первая pre-bid задает публичную стартовую цену."
                    : "No bids yet. The first pre-bid sets the public opening price."}
                </div>
              </>
            ) : (
              <>
                <div className={styles.currentPrice}>{formatMoneyFromAed(livePrice, display)}</div>
                {lot.minStepAed > 0 ? (
                  <div className={styles.minIncrement}>
                    {isRu ? "Мин. шаг:" : "Min. increment:"} <strong>{formatMoneyFromAed(lot.minStepAed, display)}</strong>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {showBuyNow ? (
            <div className={styles.priceCell}>
              <div className={styles.priceLabel}>Buy Now</div>
              <div className={styles.buyNowPrice}>{formatMoneyFromAed(lot.buyNowAed, display)}</div>
              {buyNowSaving > 0 ? (
                <div className={styles.savingBadge}>
                  {isRu ? `${buyNowSaving}% ниже рынка` : `${buyNowSaving}% below market`}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLive ? (
          <div className={styles.nextBid}>
            <span>{isRu ? "Минимальная следующая ставка" : "Minimum next bid"}</span>
            <strong>{formatMoneyFromAed(nextBid, display)}</strong>
          </div>
        ) : null}

        {isScheduled && nextScheduledBid !== null ? (
          <div className={styles.nextBid}>
            <span>{isRu ? "Следующая pre-bid ставка" : "Next pre-bid"}</span>
            <strong>{formatMoneyFromAed(nextScheduledBid, display)}</strong>
          </div>
        ) : null}
      </div>

      {!isClosed ? (
        <div className={styles.actions}>
          {isLive && canBid ? (
            <button
              className={`btn btn-primary ${styles.bidBtn}`}
              onClick={() => void placeBid(nextBid)}
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? isRu
                  ? "Отправка ставки…"
                  : "Placing bid…"
                : isRu
                  ? `Сделать ставку · ${formatMoneyFromAed(nextBid, display)}`
                  : `Place Bid · ${formatMoneyFromAed(nextBid, display)}`}
            </button>
          ) : null}

          {isScheduled && canBid && !hasVisibleScheduledBid ? (
            <>
              <div className={styles.manualBidGroup}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className={styles.manualBidInput}
                  placeholder={isRu ? "Введите сумму в AED" : "Enter amount in AED"}
                  value={manualBidAed}
                  onChange={(event) => setManualBidAed(event.target.value)}
                />
                <button
                  className={`btn btn-primary ${styles.bidBtn}`}
                  onClick={handleFirstPreBid}
                  disabled={busy || !hasValidManualBid}
                  aria-busy={busy}
                >
                  {busy ? (isRu ? "Отправка pre-bid…" : "Placing pre-bid…") : isRu ? "Сделать первую pre-bid" : "Place First Pre-Bid"}
                </button>
              </div>
              <div className={styles.helperText}>
                {isRu
                  ? "Первая pre-bid ставка задает публичную стартовую цену до аукциона."
                  : "The first pre-bid sets the public starting price before the auction begins."}
              </div>
            </>
          ) : null}

          {isScheduled && canBid && nextScheduledBid !== null ? (
            <button
              className={`btn btn-primary ${styles.bidBtn}`}
              onClick={() => void placeBid(nextScheduledBid)}
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? isRu
                  ? "Отправка pre-bid…"
                  : "Placing pre-bid…"
                : isRu
                  ? `Pre-Bid · ${formatMoneyFromAed(nextScheduledBid, display)}`
                  : `Pre-Bid · ${formatMoneyFromAed(nextScheduledBid, display)}`}
            </button>
          ) : null}

          {showBuyNow ? (
            <button className={styles.buyNowBtn} onClick={() => void handleBuyNow()} disabled={busy || buyNowSuccess}>
              {buyNowSuccess
                ? isRu
                  ? "Покупка подтверждена"
                  : "Purchase Confirmed"
                : `Buy Now — ${formatMoneyFromAed(lot.buyNowAed, display)}`}
            </button>
          ) : null}

          <button
            className={`${styles.watchlistBtn} ${saved ? styles.watchlistActive : ""}`}
            onClick={() => void toggleWatchlist()}
            aria-pressed={saved}
          >
            {saved ? (isRu ? "Сохранено в избранное" : "Saved to Watchlist") : isRu ? "Добавить в избранное" : "Add to Watchlist"}
          </button>
        </div>
      ) : null}

      {outcome ? (
        <div className={`${styles.feedback} ${styles[`fb_${outcome.type}`]}`} role="status" aria-live="polite">
          {outcome.msg}
        </div>
      ) : null}

      {showActionGate ? (
        <div className={styles.authGate} role="alert">
          <div className={styles.authText}>
            <p>{isRu ? "Добавьте security deposit, чтобы начать bidding." : "Please add a security deposit to start bidding."}</p>
            <p>{gateSecondaryMessage}</p>
          </div>
          <div className={styles.depositNotice}>
            {isRu
              ? "Возвратный депозит 5 000 AED обязателен для pre-bid и live bidding."
              : "A refundable 5,000 AED deposit is required for both pre-bids and live bidding."}
          </div>
          <Link href={gateHref} className={`btn btn-primary btn-full ${styles.signInBtn}`}>
            {isRu ? "Добавить Security Deposit" : "Add Security Deposit"}
          </Link>
          {!viewer.authenticated ? (
            <p className={styles.whoCanBid}>
              {isRu
                ? "Гости видят текущую ставку, но bidding доступен только после регистрации и депозита."
                : "Guests can view the current bid, but bidding unlocks only after registration and deposit."}
            </p>
          ) : null}
        </div>
      ) : null}

      {showHowToBid ? (
        <div className={styles.howToBid}>
          <p className={styles.howToBidTitle}>{isRu ? "Как начать bidding" : "How to Start Bidding"}</p>
          <ol className={styles.howToBidList}>
            <li>
              <strong>{isRu ? "1. Войдите или зарегистрируйтесь" : "1. Sign In or Register"}</strong>
              <span>
                {isRu
                  ? "Создайте buyer-аккаунт, чтобы открыть deposit и bidding."
                  : "Create your buyer account to unlock deposit and bidding access."}
              </span>
            </li>
            <li>
              <strong>{isRu ? "2. Добавьте депозит" : "2. Add Security Deposit"}</strong>
              <span>
                {isRu
                  ? "Возвратный депозит 5 000 AED разблокирует pre-bid и live bidding."
                  : "A refundable 5,000 AED deposit unlocks both pre-bids and live bidding."}
              </span>
            </li>
            <li>
              <strong>{isRu ? "3. Делайте pre-bid или live ставки" : "3. Place Pre-Bids or Live Bids"}</strong>
              <span>
                {isRu
                  ? "До старта вы можете задать первую pre-bid или поднять цену на +500 AED."
                  : "Before the auction starts, place the first pre-bid or raise the price by +500 AED."}
              </span>
            </li>
          </ol>
          {!viewer.authenticated ? (
            <Link href="/register/buyer" className={styles.registerLink}>
              {isRu ? "Регистрация buyer-аккаунта" : "Register as a Buyer"}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className={styles.depositInfo}>
        <span className={styles.depositInfoText}>
          {isRu
            ? "Возвратный депозит 5 000 AED обязателен · при проигрыше блокировка снимается"
            : "5,000 AED refundable deposit required · released when you do not win"}
        </span>
      </div>
    </div>
  );
}
