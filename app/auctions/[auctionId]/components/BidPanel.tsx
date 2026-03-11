'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatAed, formatCountdown, savingPct, pad } from '@/src/lib/utils';
import type { LotDetail } from '../page';
import styles from './BidPanel.module.css';

type Props = {
  lot: LotDetail;
  totalBids?: number;
};

type Outcome = { type: 'success' | 'error' | 'info'; msg: string } | null;

function useCountdown(iso: string) {
  const [cd, setCd] = useState(() =>
    formatCountdown(new Date(iso).getTime() - Date.now())
  );

  useEffect(() => {
    const t = setInterval(() => {
      setCd(formatCountdown(new Date(iso).getTime() - Date.now()));
    }, 1_000);

    return () => clearInterval(t);
  }, [iso]);

  return cd;
}

function useToken() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return (
      localStorage.getItem('fleetbid_token') ??
      sessionStorage.getItem('fleetbid_token')
    );
  });

  useEffect(() => {
    const syncToken = () => {
      const stored =
        localStorage.getItem('fleetbid_token') ??
        sessionStorage.getItem('fleetbid_token');
      setToken(stored);
    };

    window.addEventListener('storage', syncToken);
    return () => window.removeEventListener('storage', syncToken);
  }, []);

  return token;
}

export function BidPanel({ lot, totalBids = 0 }: Props) {
  const router = useRouter();
  const token = useToken();

  const isLive = lot.state === 'LIVE' || lot.state === 'EXTENDED';
  const isScheduled = lot.state === 'SCHEDULED';
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
        const response = await fetch(`/api/auctions/${lot.auctionId}/live`);

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { currentPrice?: number };

        if (typeof data.currentPrice === 'number' && data.currentPrice !== livePrice) {
          setLivePrice(data.currentPrice);
        }
      } catch {
        // Network hiccup: keep current UI state.
      }
    }, 3_000);

    return () => clearInterval(poll);
  }, [isLive, lot.auctionId, livePrice]);

  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buyNowSuccess, setBuyNowSuccess] = useState(false);

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
      if (!token) {
        router.push('/login');
        return;
      }

      setBusy(true);

      try {
        const idempotencyKey = `bid-${lot.auctionId}-${amount}-${Date.now()}`;
        const response = await fetch('/api/bids', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            auctionId: lot.auctionId,
            amount,
          }),
        });

        const payload = (await response.json()) as { error?: string; message?: string };

        if (response.ok) {
          showOutcome({ type: 'success', msg: `Bid placed: ${formatAed(amount)}` });
          setLivePrice(amount);
          return;
        }

        showOutcome({
          type: 'error',
          msg: payload.message ?? payload.error ?? 'Bid failed. Please try again.',
        });
      } catch {
        showOutcome({ type: 'error', msg: 'Network error. Check connection.' });
      } finally {
        setBusy(false);
      }
    },
    [lot.auctionId, router, token]
  );

  const handleBuyNow = useCallback(async () => {
    const authToken =
      token ??
      localStorage.getItem('fleetbid_token') ??
      sessionStorage.getItem('fleetbid_token');

    if (!authToken) {
      router.push('/login');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/auctions/${lot.auctionId}/buy-now`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload =
        ((await response.json().catch(() => ({}))) as { message?: string }) ?? {};

      if (response.ok) {
        setBuyNowSuccess(true);
        showOutcome({ type: 'success', msg: payload.message ?? 'Purchase confirmed' });
        return;
      }

      showOutcome({ type: 'error', msg: payload.message ?? 'Buy Now failed' });
    } catch {
      showOutcome({ type: 'error', msg: 'Network error. Check connection.' });
    } finally {
      setBusy(false);
    }
  }, [lot.auctionId, router, token]);

  const toggleWatchlist = useCallback(async () => {
    if (!token) {
      router.push('/login');
      return;
    }

    const method = saved ? 'DELETE' : 'POST';

    try {
      await fetch(`/api/buyer/wishlist/${lot.auctionId}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      setSaved(!saved);
    } catch {
      // Silently ignore watchlist errors.
    }
  }, [lot.auctionId, router, saved, token]);

  const nextBid = livePrice + lot.minStepAed;
  const saving = savingPct(lot.buyNowAed || lot.currentBidAed * 1.3, livePrice);
  const countdownDone =
    cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0;

  const countdownDate = new Date(countdownIso);
  const countdownDateLabel = countdownDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const countdownTimeLabel = countdownDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div id="bid-panel" className={styles.panel}>
      <div className={styles.statusRow}>
        {isLive && (
          <div className={styles.liveStatus}>
            <span className={styles.liveDot} aria-hidden />
            <span className={styles.liveLabel}>LIVE AUCTION</span>
          </div>
        )}
        {isScheduled && (
          <div className={styles.schedStatus}>
            <span className={styles.calIcon} aria-hidden>
              📅
            </span>
            <span>UPCOMING</span>
          </div>
        )}
        {isClosed && (
          <div className={styles.closedStatus}>
            {lot.state === 'PAYMENT_PENDING' ? '⏳ Payment Pending' : 'Auction Ended'}
          </div>
        )}
      </div>

      {!isClosed && !countdownDone && (
        <div className={styles.countdown} aria-live="polite" aria-label="Countdown">
          <div className={styles.cdLabel}>{isLive ? 'Ends in' : 'Starts in'}</div>

          <div className={styles.cdTimer}>
            {cd.days > 0 && (
              <>
                <div className={styles.cdUnit}>
                  <div className={styles.cdNum}>{cd.days}</div>
                  <div className={styles.cdLbl}>day{cd.days !== 1 ? 's' : ''}</div>
                </div>
                <span className={styles.cdColon} aria-hidden>
                  :
                </span>
              </>
            )}

            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.hours)}</div>
              <div className={styles.cdLbl}>hrs</div>
            </div>
            <span className={styles.cdColon} aria-hidden>
              :
            </span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.minutes)}</div>
              <div className={styles.cdLbl}>min</div>
            </div>
            <span className={styles.cdColon} aria-hidden>
              :
            </span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.seconds)}</div>
              <div className={styles.cdLbl}>sec</div>
            </div>
          </div>

          <div className={styles.bidMeta}>
            {totalBids > 0 ? (
              <span>
                🔨 {totalBids} bid{totalBids !== 1 ? 's' : ''}
              </span>
            ) : (
              <span />
            )}
            <span>
              {isLive ? 'Ends' : 'Starts'} {countdownDateLabel}, {countdownTimeLabel} GST
            </span>
          </div>
        </div>
      )}

      {!isClosed && countdownDone && (
        <div className={styles.cdEnded}>
          {isLive ? 'Bidding has closed' : 'Auction is starting…'}
        </div>
      )}

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <div className={styles.priceCell}>
            <div className={styles.priceLabel}>Current bid</div>
            <div className={styles.currentPrice}>{formatAed(livePrice)}</div>
            {lot.minStepAed > 0 && (
              <div className={styles.minIncrement}>
                Min. increment: <strong>{formatAed(lot.minStepAed)}</strong>
              </div>
            )}
          </div>

          {lot.buyNowAed > 0 && (
            <div className={styles.priceCell}>
              <div className={styles.priceLabel}>Buy Now</div>
              <div className={styles.buyNowPrice}>{formatAed(lot.buyNowAed)}</div>
              {saving > 0 && <div className={styles.savingBadge}>−{saving}% below market</div>}
            </div>
          )}
        </div>

        {isLive && (
          <div className={styles.nextBid}>
            <span>Minimum next bid</span>
            <strong>{formatAed(nextBid)}</strong>
          </div>
        )}
      </div>

      {!token ? (
        <>
          <div className={styles.authGate} role="alert">
            <div className={styles.authIcon} aria-hidden>
              🔐
            </div>
            <div className={styles.authText}>
              <p>You are not logged in.</p>
              <p>
                <Link href="/login">Sign in</Link> or{' '}
                <Link href="/register/buyer">register</Link> to place a bid.
              </p>
            </div>
            <div className={styles.depositNotice}>
              A refundable deposit of <strong>5,000 AED</strong> is required to participate in
              auctions.
            </div>
            <Link href="/login" className={`btn btn-primary btn-full ${styles.signInBtn}`}>
              Sign In to Bid
            </Link>
            <p className={styles.whoCanBid}>
              Anyone with a verified account and a refundable 5,000 AED deposit can participate.
            </p>
          </div>

          <div className={styles.howToBid}>
            <p className={styles.howToBidTitle}>How to Place a Bid?</p>
            <ol className={styles.howToBidList}>
              <li>
                <strong>1. Sign In or Register</strong>
                <span>Create your buyer account in minutes — it&apos;s free.</span>
              </li>
              <li>
                <strong>2. Add Security Deposit</strong>
                <span>Deposit 5,000 AED — fully refunded if you don&apos;t win.</span>
              </li>
              <li>
                <strong>3. Place Your Bid</strong>
                <span>Once deposited, you&apos;re ready to bid on any live lot.</span>
              </li>
            </ol>
            <Link href="/register/buyer" className={styles.registerLink}>
              Register as a Buyer →
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className={styles.actions}>
            {isLive && (
              <button
                className={`btn btn-primary ${styles.bidBtn}`}
                onClick={() => placeBid(nextBid)}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? 'Placing bid…' : `Place Bid · ${formatAed(nextBid)}`}
              </button>
            )}

            {isScheduled && (
              <button
                className={`btn btn-primary ${styles.bidBtn}`}
                onClick={() =>
                  showOutcome({
                    type: 'info',
                    msg: 'Pre-bid will be registered when the auction starts.',
                  })
                }
              >
                Pre-Bid Now
              </button>
            )}

            {lot.buyNowAed > 0 && !isClosed && (
              <button
                className={styles.buyNowBtn}
                onClick={handleBuyNow}
                disabled={busy || buyNowSuccess}
              >
                {buyNowSuccess ? 'Purchase Confirmed' : `Buy Now — ${formatAed(lot.buyNowAed)}`}
              </button>
            )}
          </div>

          {outcome && (
            <div
              className={`${styles.feedback} ${styles[`fb_${outcome.type}`]}`}
              role="status"
              aria-live="polite"
            >
              {outcome.msg}
            </div>
          )}

          <button
            className={`${styles.watchlistBtn} ${saved ? styles.watchlistActive : ''}`}
            onClick={toggleWatchlist}
            aria-pressed={saved}
          >
            <span aria-hidden>{saved ? '♥' : '♡'}</span>
            {saved ? 'Saved to Watchlist' : 'Add to Watchlist'}
          </button>
        </>
      )}

      <div className={styles.depositInfo}>
        <span aria-hidden>🔒</span>
        <span>5,000 AED refundable deposit required · Released within 24h if you don&rsquo;t win</span>
      </div>

      <div className={styles.sellerRow}>
        <div className={styles.sellerAvatar} aria-hidden>
          🏢
        </div>
        <div>
          <div className={styles.sellerLabel}>Sold by</div>
          <div className={styles.sellerName}>
            {lot.sellerName}
            {lot.sellerRef && <span className={styles.sellerRef}> {lot.sellerRef}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
