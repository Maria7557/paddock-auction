"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { toIntlLocale } from "@/src/i18n/routing";
import { ApiError, api, getApiErrorMessage } from "@/src/lib/api-client";
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

export function BidPanel({ lot, totalBids = 0, display }: Props) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const isRu = display.locale === "ru";

  const isLive = lot.state === "LIVE" || lot.state === "EXTENDED";
  const isScheduled = lot.state === "SCHEDULED";
  const isClosed = !isLive && !isScheduled;

  const countdownIso = isLive ? lot.endsAt : lot.startsAt;
  const cd = useCountdown(countdownIso);

  const [livePrice, setLivePrice] = useState(lot.currentBidAed);

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

  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buyNowSuccess, setBuyNowSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession(): Promise<void> {
      try {
        await api.auth.me();

        if (active) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.statusCode === 401) {
          setIsAuthenticated(false);
          return;
        }

        setIsAuthenticated(true);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setBuyNowSuccess(false);
  }, [lot.auctionId]);

  const clearOutcome = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOutcome = (next: Outcome) => {
    setOutcome(next);

    if (clearOutcome.current) {
      clearTimeout(clearOutcome.current);
    }

    clearOutcome.current = setTimeout(() => setOutcome(null), 5_000);
  };

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
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          setIsAuthenticated(false);
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
    [display, isRu, lot.auctionId, router],
  );

  const handleBuyNow = useCallback(async () => {
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
        setIsAuthenticated(false);
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
  }, [isRu, lot.auctionId, router]);

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
        setIsAuthenticated(false);
        router.push("/login");
      }

      // Ignore watchlist errors in UI.
    }
  }, [lot.auctionId, router, saved]);

  const nextBid = livePrice + lot.minStepAed;
  const saving = savingPct(lot.buyNowAed || lot.currentBidAed * 1.3, livePrice);
  const countdownDone = cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0;

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
          <div className={styles.closedStatus}>{lot.state === "PAYMENT_PENDING" ? (isRu ? "Ожидается оплата" : "Payment Pending") : isRu ? "Аукцион завершён" : "Auction Ended"}</div>
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
            {totalBids > 0 ? (
              <span>{isRu ? `${formatInteger(totalBids, display.locale)} ставок` : `${formatInteger(totalBids, display.locale)} bid${totalBids !== 1 ? "s" : ""}`}</span>
            ) : (
              <span />
            )}
            <span>
              {isLive ? (isRu ? "Конец" : "Ends") : isRu ? "Старт" : "Starts"} {countdownDateLabel}, {countdownTimeLabel} GST
            </span>
          </div>
        </div>
      )}

      {!isClosed && countdownDone && <div className={styles.cdEnded}>{isLive ? (isRu ? "Приём ставок завершён" : "Bidding has closed") : isRu ? "Аукцион начинается…" : "Auction is starting…"}</div>}

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <div className={styles.priceCell}>
            <div className={styles.priceLabel}>{isRu ? "Текущая ставка" : "Current bid"}</div>
            <div className={styles.currentPrice}>{formatMoneyFromAed(livePrice, display)}</div>
            {lot.minStepAed > 0 && (
              <div className={styles.minIncrement}>
                {isRu ? "Мин. шаг:" : "Min. increment:"} <strong>{formatMoneyFromAed(lot.minStepAed, display)}</strong>
              </div>
            )}
          </div>

          {lot.buyNowAed > 0 && (
            <div className={styles.priceCell}>
              <div className={styles.priceLabel}>Buy Now</div>
              <div className={styles.buyNowPrice}>{formatMoneyFromAed(lot.buyNowAed, display)}</div>
              {saving > 0 && <div className={styles.savingBadge}>{isRu ? `−${saving}% ниже рынка` : `−${saving}% below market`}</div>}
            </div>
          )}
        </div>

        {isLive && (
          <div className={styles.nextBid}>
            <span>{isRu ? "Минимальная следующая ставка" : "Minimum next bid"}</span>
            <strong>{formatMoneyFromAed(nextBid, display)}</strong>
          </div>
        )}
      </div>

      {isAuthenticated === false ? (
        <>
          <div className={styles.authGate} role="alert">
            <div className={styles.authText}>
              <p>{isRu ? "Вы не авторизованы." : "You are not logged in."}</p>
              <p>
                <Link href="/login">{isRu ? "Войдите" : "Sign in"}</Link> {isRu ? "или" : "or"} <Link href="/register/buyer">{isRu ? "зарегистрируйтесь" : "register"}</Link> {isRu ? "чтобы сделать ставку." : "to place a bid."}
              </p>
            </div>
            <div className={styles.depositNotice}>
              {isRu
                ? "Для участия требуется возвратный депозит 5 000 AED."
                : "A refundable deposit of 5,000 AED is required to participate in auctions."}
            </div>
            <Link href="/login" className={`btn btn-primary btn-full ${styles.signInBtn}`}>
              {isRu ? "Войти и сделать ставку" : "Sign In to Bid"}
            </Link>
            <p className={styles.whoCanBid}>
              {isRu
                ? "Участвовать могут только верифицированные аккаунты с возвратным депозитом 5 000 AED."
                : "Anyone with a verified account and a refundable 5,000 AED deposit can participate."}
            </p>
          </div>

          <div className={styles.howToBid}>
            <p className={styles.howToBidTitle}>{isRu ? "Как сделать ставку" : "How to Place a Bid?"}</p>
            <ol className={styles.howToBidList}>
              <li>
                <strong>{isRu ? "1. Войдите или зарегистрируйтесь" : "1. Sign In or Register"}</strong>
                <span>{isRu ? "Создайте аккаунт покупателя за несколько минут." : "Create your buyer account in minutes — it's free."}</span>
              </li>
              <li>
                <strong>{isRu ? "2. Внесите депозит" : "2. Add Security Deposit"}</strong>
                <span>{isRu ? "Депозит 5 000 AED полностью возвращается, если вы не выиграли." : "Deposit 5,000 AED — fully refunded if you don't win."}</span>
              </li>
              <li>
                <strong>{isRu ? "3. Сделайте ставку" : "3. Place Your Bid"}</strong>
                <span>{isRu ? "После депозита вы можете участвовать в любом live-лоте." : "Once deposited, you're ready to bid on any live lot."}</span>
              </li>
            </ol>
            <Link href="/register/buyer" className={styles.registerLink}>
              {isRu ? "Регистрация покупателя" : "Register as a Buyer"}
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className={styles.actions}>
            {isLive && (
              <button className={`btn btn-primary ${styles.bidBtn}`} onClick={() => placeBid(nextBid)} disabled={busy} aria-busy={busy}>
                {busy ? (isRu ? "Отправка ставки…" : "Placing bid…") : isRu ? `Сделать ставку · ${formatMoneyFromAed(nextBid, display)}` : `Place Bid · ${formatMoneyFromAed(nextBid, display)}`}
              </button>
            )}

            {isScheduled && (
              <button
                className={`btn btn-primary ${styles.bidBtn}`}
                onClick={() =>
                  showOutcome({
                    type: "info",
                    msg: isRu
                      ? "Пред-ставка будет зарегистрирована при старте аукциона."
                      : "Pre-bid will be registered when the auction starts.",
                  })
                }
              >
                {isRu ? "Сделать пред-ставку" : "Pre-Bid Now"}
              </button>
            )}

            {lot.buyNowAed > 0 && !isClosed && (
              <button className={styles.buyNowBtn} onClick={handleBuyNow} disabled={busy || buyNowSuccess}>
                {buyNowSuccess
                  ? isRu
                    ? "Покупка подтверждена"
                    : "Purchase Confirmed"
                  : `Buy Now — ${formatMoneyFromAed(lot.buyNowAed, display)}`}
              </button>
            )}
          </div>

          {outcome && (
            <div className={`${styles.feedback} ${styles[`fb_${outcome.type}`]}`} role="status" aria-live="polite">
              {outcome.msg}
            </div>
          )}

          <button className={`${styles.watchlistBtn} ${saved ? styles.watchlistActive : ""}`} onClick={toggleWatchlist} aria-pressed={saved}>
            {saved ? (isRu ? "Сохранено в избранное" : "Saved to Watchlist") : isRu ? "Добавить в избранное" : "Add to Watchlist"}
          </button>
        </>
      )}

      <div className={styles.depositInfo}>
        <span>
          {isRu
            ? "Возвратный депозит 5 000 AED обязателен · возврат в течение 24 часов, если вы не выиграли"
            : "5,000 AED refundable deposit required · Released within 24h if you don't win"}
        </span>
      </div>
    </div>
  );
}
