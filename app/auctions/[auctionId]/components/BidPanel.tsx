'use client';
// app/lot/[id]/components/BidPanel.tsx
// Handles: Pre-Bid (SCHEDULED), Live Bid (LIVE), Buy Now, Watchlist
// Auth-gated: shows login notice if no token

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatAed, formatCountdown, savingPct, pad } from '@/src/lib/utils';
import type { LotDetail } from '../page';
import styles from './BidPanel.module.css';

type Props = {
  lot:      LotDetail;
  compact?: boolean;
  totalBids?: number;
};

type Outcome = { type: 'success' | 'error' | 'info'; msg: string } | null;

// ─── Countdown hook ───────────────────────────────────────────────────────────

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

// ─── Auth hook ────────────────────────────────────────────────────────────────

function useToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('fleetbid_token') ??
        sessionStorage.getItem('fleetbid_token');
      setToken(stored);
    } catch { /* SSR */ }
  }, []);
  return token;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BidPanel({ lot, compact = false, totalBids = 0 }: Props) {
  const token = useToken();

  const isLive      = lot.state === 'LIVE' || lot.state === 'EXTENDED';
  const isScheduled = lot.state === 'SCHEDULED';
  const isClosed    = !isLive && !isScheduled;

  // For countdown: LIVE → endsAt, SCHEDULED → startsAt
  const countdownIso = isLive ? lot.endsAt : lot.startsAt;
  const cd = useCountdown(countdownIso);

  // Live price polling
  const [livePrice, setLivePrice] = useState(lot.currentBidAed);
  useEffect(() => {
    if (!isLive) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/auctions/${lot.auctionId}/live`);
        if (r.ok) {
          const d = (await r.json()) as { currentPrice?: number };
          if (d.currentPrice && d.currentPrice !== livePrice)
            setLivePrice(d.currentPrice);
        }
      } catch { /* network hiccup — ignore */ }
    }, 3_000);
    return () => clearInterval(poll);
  }, [isLive, lot.auctionId, livePrice]);

  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const clearOutcome = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOutcome = (o: Outcome) => {
    setOutcome(o);
    if (clearOutcome.current) {
      clearTimeout(clearOutcome.current);
    }
    clearOutcome.current = setTimeout(() => setOutcome(null), 5_000);
  };

  // ── Place bid ────────────────────────────────────────────────────────────
  const placeBid = useCallback(
    async (amount: number) => {
      if (!token) { window.location.href = '/login'; return; }
      setBusy(true);
      try {
        const idempotencyKey = `bid-${lot.auctionId}-${amount}-${Date.now()}`;
        const r = await fetch('/api/bids', {
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
        const d = (await r.json()) as { error?: string; message?: string };
        if (r.ok) {
          showOutcome({ type: 'success', msg: `Bid placed: ${formatAed(amount)}` });
          setLivePrice(amount);
        } else {
          showOutcome({ type: 'error', msg: d.message ?? d.error ?? 'Bid failed. Please try again.' });
        }
      } catch {
        showOutcome({ type: 'error', msg: 'Network error. Check connection.' });
      } finally {
        setBusy(false);
      }
    },
    [token, lot.auctionId]
  );

  // ── Toggle watchlist ─────────────────────────────────────────────────────
  const toggleWatchlist = useCallback(async () => {
    if (!token) { window.location.href = '/login'; return; }
    const method = saved ? 'DELETE' : 'POST';
    try {
      await fetch(`/api/buyer/wishlist/${lot.auctionId}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      setSaved(!saved);
    } catch { /* silent */ }
  }, [token, saved, lot.auctionId]);

  const nextBid = livePrice + lot.minStepAed;
  const saving  = savingPct(lot.buyNowAed || lot.currentBidAed * 1.3, livePrice);
  const countdownDone = cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0;

  if (compact && isClosed) return null;

  return (
    <div id={compact ? undefined : 'bid-panel'} className={`${styles.panel} ${compact ? styles.compact : ''}`}>

      {/* ── Status header ── */}
      <div className={styles.statusRow}>
        {isLive && (
          <div className={styles.liveStatus}>
            <span className={styles.liveDot} aria-hidden />
            <span className={styles.liveLabel}>LIVE AUCTION</span>
          </div>
        )}
        {isScheduled && (
          <div className={styles.schedStatus}>
            <span className={styles.calIcon} aria-hidden>📅</span>
            <span>UPCOMING</span>
          </div>
        )}
        {isClosed && (
          <div className={styles.closedStatus}>
            {lot.state === 'PAYMENT_PENDING' ? '⏳ Payment Pending' : 'Auction Ended'}
          </div>
        )}
      </div>

      {/* ── Countdown ── */}
      {!isClosed && !countdownDone && (
        <div className={styles.countdown} aria-live="polite" aria-label="Countdown">
          <div className={styles.cdLabel}>
            {isLive ? 'Ends in' : 'Starts in'}
          </div>
          <div className={styles.cdTimer}>
            {cd.days > 0 && (
              <>
                <div className={styles.cdUnit}>
                  <div className={styles.cdNum}>{cd.days}</div>
                  <div className={styles.cdLbl}>day{cd.days !== 1 ? 's' : ''}</div>
                </div>
                <span className={styles.cdColon} aria-hidden>:</span>
              </>
            )}
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.hours)}</div>
              <div className={styles.cdLbl}>hrs</div>
            </div>
            <span className={styles.cdColon} aria-hidden>:</span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.minutes)}</div>
              <div className={styles.cdLbl}>min</div>
            </div>
            <span className={styles.cdColon} aria-hidden>:</span>
            <div className={styles.cdUnit}>
              <div className={styles.cdNum}>{pad(cd.seconds)}</div>
              <div className={styles.cdLbl}>sec</div>
            </div>
          </div>
          <div className={styles.endDate}>
            {isLive ? 'Ends' : 'Starts'}{' '}
            {new Date(countdownIso).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}{', '}
            {new Date(countdownIso).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })} GST
          </div>
          {totalBids > 0 && (
            <div className={styles.bidCount}>
              <span>{totalBids}</span> bid{totalBids !== 1 ? 's' : ''} placed
            </div>
          )}
        </div>
      )}
      {!isClosed && countdownDone && (
        <div className={styles.cdEnded}>
          {isLive ? 'Bidding has closed' : 'Auction is starting…'}
        </div>
      )}

      {/* ── Price block ── */}
      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          {/* Current bid */}
          <div className={styles.priceCell}>
            <div className={styles.priceLabel}>Current bid</div>
            <div className={styles.currentPrice}>{formatAed(livePrice)}</div>
          </div>

          {/* Buy Now / Market */}
          {lot.buyNowAed > 0 && (
            <div className={styles.priceCell}>
              <div className={styles.priceLabel}>Buy Now</div>
              <div className={styles.buyNowPrice}>{formatAed(lot.buyNowAed)}</div>
              {saving > 0 && (
                <div className={styles.savingBadge}>−{saving}% below market</div>
              )}
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

      {/* ── Auth gate ── */}
      {!token ? (
        <div className={styles.authGate} role="alert">
          <div className={styles.authIcon} aria-hidden>🔐</div>
          <div className={styles.authText}>
            <p>You are not logged in.</p>
            <p>
              <Link href="/login">Sign in</Link> or{' '}
              <Link href="/register/buyer">register</Link> to place a bid.
            </p>
          </div>
          <div className={styles.depositNotice}>
            A refundable deposit of <strong>5,000 AED</strong> is required to participate in auctions.
          </div>
          <Link href="/login" className={`btn btn-primary btn-full ${styles.signInBtn}`}>
            Sign In to Bid
          </Link>
          <p className={styles.whoCanBid}>
            Anyone with a verified account and a refundable 5,000 AED deposit can participate.
          </p>
        </div>
      ) : (
        <>
          {/* Bid actions */}
          <div className={styles.actions}>
            {isLive && (
              <>
                <button
                  className={`btn btn-primary ${styles.bidBtn}`}
                  onClick={() => placeBid(nextBid)}
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy ? 'Placing bid…' : `Place Bid · ${formatAed(nextBid)}`}
                </button>
                {lot.buyNowAed > 0 && (
                  <button
                    className={`btn btn-outline ${styles.buyNowBtn}`}
                    onClick={() => placeBid(lot.buyNowAed)}
                    disabled={busy}
                  >
                    Buy Now · {formatAed(lot.buyNowAed)}
                  </button>
                )}
              </>
            )}
            {isScheduled && (
              <button
                className={`btn btn-primary ${styles.bidBtn}`}
                onClick={() => showOutcome({ type: 'info', msg: 'Pre-bid will be registered when the auction starts.' })}
              >
                Pre-Bid Now
              </button>
            )}
          </div>

          {/* Outcome feedback */}
          {outcome && (
            <div
              className={`${styles.feedback} ${styles[`fb_${outcome.type}`]}`}
              role="status"
              aria-live="polite"
            >
              {outcome.msg}
            </div>
          )}

          {/* Watchlist */}
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

      {/* ── Deposit note ── */}
      <div className={styles.depositInfo}>
        <span aria-hidden>🔒</span>
        <span>5,000 AED refundable deposit required · Released within 24h if you don&rsquo;t win</span>
      </div>

      {/* ── Seller ── */}
      <div className={styles.sellerRow}>
        <div className={styles.sellerAvatar} aria-hidden>🏢</div>
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
