"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { toIntlLocale } from "@/src/i18n/routing";
import {
  ApiError,
  api,
  getApiErrorMessage,
  getApiErrorPayload,
  type BuyerBuyingPowerResponse,
  type PlaceBidResponse,
} from "@/src/lib/api-client";
import {
  isLiveAuctionState,
  isScheduledAuctionState,
  isScheduledWithoutBids,
} from "@/src/lib/auction-display";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import type { LotDetail } from "@/src/lib/lot-detail";
import { formatAed, formatCountdown, savingPct, pad } from "@/src/lib/utils";
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

type ViewerState = {
  checked: boolean;
  authenticated: boolean;
  isBuyer: boolean;
  userStatus: string | null;
  companyStatus: string | null;
  hasRequiredDeposit: boolean;
  buyerTier: BuyerTier | null;
};

type BuyingPowerState = {
  depositAmount: number;
  ceiling: number;
  activeBidsTotal: number;
  remaining: number;
};

type BuyingPowerRequestState = "idle" | "loading" | "ready" | "missing" | "error";

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

function parseMoneyNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBuyingPower(payload: BuyerBuyingPowerResponse): BuyingPowerState {
  return {
    depositAmount: parseMoneyNumber(payload.depositAmount),
    ceiling: parseMoneyNumber(payload.ceiling),
    activeBidsTotal: parseMoneyNumber(payload.activeBidsTotal),
    remaining: parseMoneyNumber(payload.remaining),
  };
}

function buildBidErrorMessage(error: unknown, isRu: boolean): string {
  const payload = getApiErrorPayload<{
    error?: string;
    shortfall?: string;
  }>(error);

  if (payload?.error === "BID_INSUFFICIENT_DEPOSIT") {
    return isRu
      ? "Недостаточно депозита для открытия buying power."
      : "Your deposit is not enough to unlock buying power.";
  }

  if (payload?.error === "BID_CEILING_EXCEEDED") {
    const shortfall = parseMoneyNumber(payload.shortfall);

    return isRu
      ? `Недостаточно buying power. Добавьте ещё ${formatAed(shortfall)} в wallet.`
      : `Insufficient buying power. Add ${formatAed(shortfall)} more in wallet.`;
  }

  return getApiErrorMessage(
    error,
    isRu ? "Не удалось отправить ставку. Попробуйте снова." : "Bid failed. Please try again.",
  );
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
  const [buyingPower, setBuyingPower] = useState<BuyingPowerState | null>(null);
  const [buyingPowerRequestState, setBuyingPowerRequestState] = useState<BuyingPowerRequestState>("idle");
  const [showBuyingPowerLoading, setShowBuyingPowerLoading] = useState(false);
  const [livePrice, setLivePrice] = useState(lot.currentBidAed);
  const [visibleBidCount, setVisibleBidCount] = useState(totalBids);
  const [manualBidAed, setManualBidAed] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buyNowSuccess, setBuyNowSuccess] = useState(false);
  const clearOutcome = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialBuyingPowerRequestStarted = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setLivePrice(lot.currentBidAed);
    setVisibleBidCount(totalBids);
    setManualBidAed("");
    setBuyNowSuccess(false);
  }, [lot.auctionId, lot.currentBidAed, totalBids]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshBuyingPower = useCallback(async () => {
    const isInitialRequest = !initialBuyingPowerRequestStarted.current;

    if (isInitialRequest) {
      initialBuyingPowerRequestStarted.current = true;
      setBuyingPowerRequestState("loading");
    }

    try {
      const payload = await api.buyer.buyingPower<BuyerBuyingPowerResponse>({
        cache: "no-store",
      });

      if (!isMountedRef.current) {
        return;
      }

      const normalizedBuyingPower = normalizeBuyingPower(payload);
      const hasRequiredDeposit = normalizedBuyingPower.depositAmount > 0 && normalizedBuyingPower.ceiling > 0;

      setBuyingPower(normalizedBuyingPower);
      setBuyingPowerRequestState(hasRequiredDeposit ? "ready" : "missing");
      setViewer((currentViewer) =>
        currentViewer.isBuyer
          ? {
              ...currentViewer,
              hasRequiredDeposit,
            }
          : currentViewer,
      );
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        setBuyingPower(null);
        setBuyingPowerRequestState("idle");
        setViewer({
          ...DEFAULT_VIEWER_STATE,
          checked: true,
        });
        return;
      }

      setBuyingPower(null);
      setBuyingPowerRequestState("error");
      setViewer((currentViewer) =>
        currentViewer.isBuyer
          ? {
              ...currentViewer,
              hasRequiredDeposit: false,
            }
          : currentViewer,
      );
    }
  }, []);

  useEffect(() => {
    if (buyingPowerRequestState !== "loading") {
      setShowBuyingPowerLoading(false);
      return;
    }

    setShowBuyingPowerLoading(true);

    const timeoutId = setTimeout(() => {
      if (!isMountedRef.current) {
        return;
      }

      setShowBuyingPowerLoading(false);
      setBuyingPowerRequestState((currentState) => (currentState === "loading" ? "error" : currentState));
    }, 2_000);

    return () => clearTimeout(timeoutId);
  }, [buyingPowerRequestState]);

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

          if (viewer.isBuyer) {
            void refreshBuyingPower();
          }
        }
      } catch {
        // Keep existing UI state on transient errors.
      }
    }, 3_000);

    return () => clearInterval(poll);
  }, [isLive, livePrice, lot.auctionId, refreshBuyingPower, viewer.isBuyer]);

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
          setBuyingPower(null);
          setBuyingPowerRequestState("idle");
          setViewer(nextViewer);
          return;
        }

        setViewer(nextViewer);
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.statusCode === 401) {
          setViewer({
            ...DEFAULT_VIEWER_STATE,
            checked: true,
          });
          setBuyingPowerRequestState("idle");
          return;
        }

        setViewer({
          ...DEFAULT_VIEWER_STATE,
          checked: true,
          authenticated: true,
        });
        setBuyingPowerRequestState("error");
      }
    }

    void loadViewer();

    return () => {
      active = false;
    };
  }, [refreshBuyingPower]);

  useEffect(() => {
    if (!viewer.checked || !viewer.authenticated || !viewer.isBuyer) {
      return;
    }

    void refreshBuyingPower();
  }, [refreshBuyingPower, viewer.authenticated, viewer.checked, viewer.isBuyer]);

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
  const hasActiveBuyingPower =
    buyingPower !== null &&
    buyingPower.depositAmount > 0 &&
    buyingPower.ceiling > 0;
  const canAttemptBid =
    viewer.authenticated &&
    viewer.isBuyer &&
    hasBuyerAccessStatus(viewer.userStatus) &&
    hasBuyerAccessStatus(viewer.companyStatus);
  const isBuyingPowerReady = buyingPowerRequestState === "ready" && hasActiveBuyingPower;
  const canBid =
    canAttemptBid &&
    viewer.hasRequiredDeposit;
  const canTransact = canBid && isBuyingPowerReady;
  const gateHref = viewer.authenticated ? "/wallet" : "/login";
  const nextBid = livePrice + lot.minStepAed;
  const nextScheduledBid = livePrice > 0 ? livePrice + lot.minStepAed : null;
  const firstManualBidAmount = Number(manualBidAed);
  const hasValidManualBid = Number.isFinite(firstManualBidAmount) && firstManualBidAmount > 0;
  const enteredBidAmount =
    isLive
      ? nextBid
      : isScheduled && !hasVisibleScheduledBid
        ? (hasValidManualBid ? firstManualBidAmount : null)
        : nextScheduledBid;
  const marketReference = lot.actualCashValue > 0 ? lot.actualCashValue : 0;
  const buyNowSaving =
    lot.buyNowAed > 0 && marketReference > lot.buyNowAed ? savingPct(marketReference, lot.buyNowAed) : 0;
  const countdownDone = cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0;
  const showActionGate = !isClosed && viewer.checked && !canBid;
  const showHowToBid = !isClosed && viewer.checked && !canBid;
  const showBuyNow = lot.buyNowAed > 0;
  const buyingPowerStatusLabel = buyingPower
    ? formatAed(buyingPower.remaining)
    : showBuyingPowerLoading
      ? isRu
        ? "Проверяем buying power…"
        : "Checking buying power..."
      : isRu
        ? "Buying power временно недоступен"
        : "Buying power unavailable right now";
  const hasZeroBuyingPower =
    canTransact && buyingPower !== null && buyingPower.remaining <= 0;
  const hasInsufficientBuyingPower =
    canTransact &&
    buyingPower !== null &&
    enteredBidAmount !== null &&
    buyingPower.remaining < enteredBidAmount;
  const shouldShowMissingDepositState =
    canAttemptBid &&
    !showBuyingPowerLoading &&
    (buyingPowerRequestState === "missing" || (buyingPower !== null && !hasActiveBuyingPower));
  const shouldShowNeutralBuyingPowerState =
    canAttemptBid &&
    !showBuyingPowerLoading &&
    !isBuyingPowerReady &&
    !shouldShowMissingDepositState &&
    (buyingPowerRequestState === "loading" || buyingPowerRequestState === "error");
  const shouldShowBuyingPowerSummary =
    canAttemptBid &&
    (showBuyingPowerLoading || isBuyingPowerReady || shouldShowNeutralBuyingPowerState);
  const shouldDisableBidAction = busy || hasInsufficientBuyingPower;
  const gateSecondaryMessage = useMemo(() => {
    if (!viewer.authenticated) {
      return isRu
        ? "Войдите или зарегистрируйтесь, затем перейдите к депозиту."
        : "Sign in or register first, then continue to your deposit.";
    }

    if (!viewer.isBuyer) {
      return isRu
        ? "Только активные buyer-аккаунты с депозитом могут делать ставки."
        : "Only active buyer accounts with a ready deposit can place bids.";
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
        const payload = await api.bids.place<PlaceBidResponse>(lot.auctionId, amount, idempotencyKey);

        showOutcome({
          type: "success",
          msg: isRu
            ? `Ставка принята: ${formatMoneyFromAed(amount, display)}`
            : `Bid placed: ${formatMoneyFromAed(amount, display)}`,
        });
        setLivePrice(parseMoneyNumber(payload.bid?.amount) || amount);
        setVisibleBidCount((count) => count + 1);
        setManualBidAed("");
        setBuyingPower(
          normalizeBuyingPower({
            depositAmount: buyingPower?.depositAmount?.toFixed(2) ?? "0.00",
            activeBids: [],
            activeBidsTotal: payload.buyingPower.activeBidsTotal,
            ceiling: payload.buyingPower.ceiling,
            remaining: payload.buyingPower.remaining,
          }),
        );
        setBuyingPowerRequestState("ready");
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
          msg: buildBidErrorMessage(error, isRu),
        });
      } finally {
        setBusy(false);
      }
    },
    [buyingPower?.depositAmount, display, isRu, lot.auctionId, router, showOutcome],
  );

  const handleBuyNow = useCallback(async () => {
    if (!canTransact) {
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
  }, [canTransact, gateHref, isRu, lot.auctionId, router, showOutcome]);

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
          {!viewer.authenticated && viewer.checked ? (
            <div className={`${styles.feedback} ${styles.fb_info}`} role="status" aria-live="polite">
              {isRu ? "Войдите, чтобы сделать ставку" : "Login to place a bid"}{" "}
              <Link href="/login" className={styles.inlineLink}>
                {isRu ? "Войти" : "Log in"}
              </Link>
            </div>
          ) : null}

          {shouldShowBuyingPowerSummary ? (
            <div className={styles.buyingPowerSummary}>
              <span className={styles.buyingPowerLabel}>
                BUYING POWER
              </span>
              <strong className={styles.buyingPowerValue}>
                {isBuyingPowerReady && buyingPower
                  ? isRu
                    ? `${buyingPowerStatusLabel} доступно`
                    : `${buyingPowerStatusLabel} remaining`
                  : buyingPowerStatusLabel}
              </strong>
              {isBuyingPowerReady && buyingPower ? (
                <span className={styles.buyingPowerMeta}>
                  {isRu
                    ? `${formatAed(buyingPower.activeBidsTotal)} в активных ставках из ${formatAed(buyingPower.ceiling)} ceiling`
                    : `${formatAed(buyingPower.activeBidsTotal)} in active bids of ${formatAed(buyingPower.ceiling)} ceiling`}
                </span>
              ) : shouldShowNeutralBuyingPowerState ? (
                <span className={styles.buyingPowerMeta}>
                  {isRu
                    ? "Мы всё ещё обновляем статус. Попробуйте ещё раз через пару секунд."
                    : "We are still refreshing your status. Try again in a moment."}
                </span>
              ) : null}
            </div>
          ) : null}

          {shouldShowMissingDepositState ? (
            <div className={`${styles.feedback} ${styles.fb_info}`} role="status" aria-live="polite">
              {isRu ? "Нет активного депозита — добавьте депозит для ставок" : "No active deposit — Add deposit to bid"}{" "}
              <Link href="/wallet" className={styles.inlineLink}>
                {isRu ? "Открыть wallet" : "Open wallet"}
              </Link>
            </div>
          ) : null}

          {canBid && hasZeroBuyingPower ? (
            <div className={`${styles.feedback} ${styles.fb_error}`} role="status" aria-live="polite">
              {isRu ? "Лимит buying power достигнут — пополните депозит" : "Buying power limit reached — add deposit"}{" "}
              <Link href="/wallet" className={styles.inlineLink}>
                {isRu ? "Открыть wallet" : "Open wallet"}
              </Link>
            </div>
          ) : null}

          {canBid && !hasZeroBuyingPower && hasInsufficientBuyingPower && enteredBidAmount !== null ? (
            <div className={`${styles.feedback} ${styles.fb_error}`} role="status" aria-live="polite">
              {isRu ? "Недостаточно buying power" : "Insufficient buying power"}{" "}
              <Link href="/wallet" className={styles.inlineLink}>
                {isRu ? "Открыть wallet" : "Open wallet"}
              </Link>
            </div>
          ) : null}

          {isLive && canTransact ? (
            <button
              className={`btn btn-primary ${styles.bidBtn}`}
              onClick={() => void placeBid(nextBid)}
              disabled={shouldDisableBidAction}
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

          {isScheduled && canTransact && !hasVisibleScheduledBid ? (
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
                  disabled={busy || !hasValidManualBid || hasInsufficientBuyingPower}
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

          {isScheduled && canTransact && nextScheduledBid !== null ? (
            <button
              className={`btn btn-primary ${styles.bidBtn}`}
              onClick={() => void placeBid(nextScheduledBid)}
              disabled={shouldDisableBidAction}
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
