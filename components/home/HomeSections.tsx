import Link from 'next/link';
import Image from 'next/image';
import {
  IconBuilding, IconCalendar, IconEye, IconShield,
  IconCheck, IconX, IconUsers, IconCar, IconMapPin,
  IconTag, IconFile, IconZap, IconArrowRight,
} from '@/components/ui/icons';
import type { AuctionWeekEvent } from '@/src/types/auction';
import WeekCountdown from './WeekCountdown';
import styles from './HomeSections.module.css';

/* ══ §1 WHAT IS FLEETBID ══════════════════════════════════════════════════════ */
export function WhatSection() {
  return (
    <section className={`${styles.sec} ${styles.white}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow">About the Platform</div>
          <h2 className={`section-h2 ${styles.mb16}`}>What Is FleetBid?</h2>
          <p className={styles.body}>
            FleetBid is a structured weekly auction platform for institutional fleet vehicles
            operating in the UAE rental market.
          </p>
          <p className={styles.body} style={{ marginTop: 12 }}>
            We aggregate active rental inventory entering scheduled replacement cycles and
            connect it with verified buyers through transparent, event-based liquidation.
          </p>
          <p className={styles.body} style={{ marginTop: 12 }}>
            <strong>All vehicles are operational fleet units</strong> — not insurance write-offs,
            not damaged stock.
          </p>
          <div className={styles.ctas} style={{ marginTop: 28 }}>
            <Link href="/auctions" className="btn btn-primary">Browse Auctions</Link>
            <Link href="/register" className="btn btn-outline">Register as Buyer</Link>
          </div>
        </div>

        <div className={styles.cards}>
          {[
            { icon: <IconBuilding size={18} color="var(--green-600)" />, cls: 'g',
              title: 'Institutional Fleet Source',
              text: 'Vehicles from UAE rental companies in scheduled replacement — not unknown provenance.' },
            { icon: <IconCalendar size={18} color="var(--blue-600)" />, cls: 'b',
              title: 'Weekly Structured Events',
              text: 'Regular, calendar-based auctions. Plan your bidding weeks in advance.' },
            { icon: <IconEye size={18} color="var(--green-600)" />, cls: 'g',
              title: 'Full Transparency',
              text: 'Real-time bid history, inspection reports, service docs — all visible before you bid.' },
            { icon: <IconShield size={18} color="var(--amber-600)" />, cls: 'a',
              title: 'Deposit-Enforced Bidding',
              text: '5,000 AED refundable deposit. Only serious buyers. No price manipulation.' },
          ].map((c, i) => (
            <div key={i} className={styles.whatCard}>
              <div className={`${styles.whatIcon} ${styles[c.cls]}`}>{c.icon}</div>
              <div>
                <div className={styles.cardTitle}>{c.title}</div>
                <div className={styles.cardText}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══ §2 NOT INSURANCE ════════════════════════════════════════════════════════ */
const YES_ITEMS = [
  'Fully serviced rental fleet vehicles',
  'Transparent maintenance history included',
  'Operated in UAE rental market',
  'Road-ready condition at time of auction',
  'Physical inspection access before every auction',
  'Export-ready with Dubai Customs clearance',
];
const NO_ITEMS = [
  'No insurance write-offs',
  'No damaged liquidation stock',
  'No unknown vehicle provenance',
];

export function WhySection() {
  return (
    <section className={`${styles.sec} ${styles.dark}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-white">Our Inventory</div>
          <h2 className={`section-h2 section-h2-white ${styles.mb16}`}>
            Not Insurance.<br />Not Salvage.
          </h2>
          <p className={styles.bodyWhite}>
            Most vehicle auction platforms aggregate damaged or insurance write-off stock.
            FleetBid is built around a fundamentally different inventory source.
          </p>
          <div className={styles.ctas} style={{ marginTop: 28 }}>
            <Link href="/auctions" className="btn btn-white">Browse Inventory</Link>
            <Link href="/how-it-works" className="btn btn-ghost-white">View Inspection Reports</Link>
          </div>
        </div>

        <div className={styles.whyList}>
          {YES_ITEMS.map(t => (
            <div key={t} className={`${styles.whyItem} ${styles.yes}`}>
              <div className={`${styles.whyCheck} ${styles.checkYes}`}>
                <IconCheck size={12} color="#fff" />
              </div>
              <span>{t}</span>
            </div>
          ))}
          <div className={styles.divider} />
          {NO_ITEMS.map(t => (
            <div key={t} className={`${styles.whyItem} ${styles.no}`}>
              <div className={`${styles.whyCheck} ${styles.checkNo}`}>
                <IconX size={12} color="rgba(255,255,255,0.2)" />
              </div>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══ §3 HOW IT WORKS ════════════════════════════════════════════════════════ */
const BUYER_STEPS = [
  { t: 'Create account', s: 'Company details + UAE trade license. Approved within 24h.' },
  { t: 'Pay 5,000 AED refundable deposit', s: 'Released within 24h if you don\'t win.' },
  { t: 'Access weekly auctions', s: 'Browse inventory, book physical inspection.' },
  { t: 'Bid in real time', s: 'Legally binding. See your position instantly.' },
  { t: 'Settle within 48h', s: 'Invoice issued immediately. Export docs included.' },
];
const SELLER_STEPS = [
  { t: 'Register company', s: 'Trade license + company details.' },
  { t: 'Submit vehicle with start price', s: 'Mulkiya, service history, photos.' },
  { t: 'Deliver vehicle 48h before auction', s: 'Dubai warehouse · we handle inspection.' },
  { t: 'Participate in weekly event', s: 'Watch live bids in real time.' },
  { t: 'Approve & receive payment', s: 'Buyer settles in 48h. Funds transferred directly.' },
];

export function HowSection() {
  return (
    <section className={`${styles.sec} ${styles.subtle}`}>
      <div className="container">
        <div className={styles.centreHead}>
          <div className="eyebrow">Simple Process</div>
          <h2 className="section-h2" style={{ marginTop: 6 }}>How FleetBid Works</h2>
        </div>
        <div className={styles.howGrid}>
          {/* Buyers */}
          <div className={styles.howBlock}>
            <div className={styles.howHead}>
              <div className={`${styles.howIcon} ${styles.iconGreen}`}>
                <IconUsers size={20} color="var(--green-600)" />
              </div>
              <div>
                <div className={styles.blockTitle}>For Buyers</div>
                <div className={styles.blockSub}>Verified dealers &amp; export traders</div>
              </div>
            </div>
            {BUYER_STEPS.map((s, i) => (
              <div key={i} className={styles.step}>
                <div className={`${styles.num} ${styles.numGreen}`}>{i + 1}</div>
                <div>
                  <div className={styles.stepTitle}>{s.t}</div>
                  <div className={styles.stepSub}>{s.s}</div>
                </div>
              </div>
            ))}
            <Link href="/register" className={`btn btn-primary btn-full ${styles.blockCta}`}>
              Start Bidding
            </Link>
          </div>

          {/* Sellers */}
          <div className={styles.howBlock}>
            <div className={styles.howHead}>
              <div className={`${styles.howIcon} ${styles.iconBlue}`}>
                <IconCar size={20} color="var(--blue-600)" />
              </div>
              <div>
                <div className={styles.blockTitle}>For Fleet Companies</div>
                <div className={styles.blockSub}>Rental operators &amp; fleet managers</div>
              </div>
            </div>
            {SELLER_STEPS.map((s, i) => (
              <div key={i} className={styles.step}>
                <div className={`${styles.num} ${styles.numBlue}`}>{i + 1}</div>
                <div>
                  <div className={styles.stepTitle}>{s.t}</div>
                  <div className={styles.stepSub}>{s.s}</div>
                </div>
              </div>
            ))}
            <Link href="/register?role=seller" className={`btn btn-blue btn-full ${styles.blockCta}`}>
              List Your Vehicle
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══ §4 THIS WEEK'S AUCTION ══════════════════════════════════════════════════ */
export function WeekSection({ event }: { event: AuctionWeekEvent }) {
  const dateStr = new Date(event.date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <section className={`${styles.sec} ${styles.green}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className={`eyebrow eyebrow-white ${styles.liveEyebrow}`}>
            <span className="live-dot" />Upcoming Event
          </div>
          <h2 className={`section-h2 section-h2-white ${styles.weekH2}`}>
            This Week's<br />Auction
          </h2>
          <div className={styles.weekDate}>{dateStr} — 15:00 GST</div>

          {[
            { icon: <IconMapPin size={14} color="#fff" />, text: event.location },
            { icon: <IconEye size={14} color="#fff" />,    text: 'Inspection: 4–5 March, 10:00–17:00' },
            { icon: <IconCar size={14} color="#fff" />,    text: `${event.lotCount} lots confirmed · SUVs, Sedans, Luxury` },
            { icon: <IconTag size={14} color="#fff" />,    text: 'Starting bids from AED 35,000' },
          ].map((d, i) => (
            <div key={i} className={styles.weekDetail}>
              <div className={styles.weekDetailIcon}>{d.icon}</div>
              {d.text}
            </div>
          ))}

          <div className={styles.ctas} style={{ marginTop: 24 }}>
            <Link href="/auctions" className="btn btn-white btn-lg">View Inventory</Link>
            <Link href="/register?action=inspection" className="btn btn-ghost-white btn-lg">
              Schedule Inspection
            </Link>
          </div>
        </div>

        {/* Countdown (client) */}
        <WeekCountdown auctionDate={event.date} />
      </div>
    </section>
  );
}

/* ══ §5 CATEGORIES ══════════════════════════════════════════════════════════ */
export function CatsSection({ categories }: {
  categories: { slug: string; label: string; sub: string; image: string }[]
}) {
  return (
    <section className={`${styles.sec} ${styles.white}`}>
      <div className="container">
        <div className={styles.centreHead}>
          <div className="eyebrow">Inventory</div>
          <h2 className="section-h2" style={{ marginTop: 6 }}>Explore by Category</h2>
        </div>
        <div className={styles.catsGrid}>
          {categories.map(c => (
            <Link key={c.slug} href={`/auctions?category=${c.slug}`} className={styles.catCard}>
              <Image src={c.image} alt={c.label} fill sizes="300px" style={{ objectFit: 'cover' }} />
              <div className={styles.catOverlay} />
              <div className={styles.catContent}>
                <div className={styles.catTitle}>{c.label}</div>
                <div className={styles.catSub}>{c.sub}</div>
                <div className={styles.catCta}>
                  View Category <IconArrowRight size={12} color="#fff" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══ §6 SELL WITH FLEETBID ══════════════════════════════════════════════════ */
const SELL_STEPS = [
  { t: 'Register company',                  s: 'UAE trade license + company details' },
  { t: 'Submit vehicle with start price',   s: 'Mulkiya, service history, photos' },
  { t: 'Deliver vehicle 48h before auction',s: 'Dubai warehouse · we handle inspection' },
  { t: 'Participate in weekly event',        s: 'Watch live bids on your vehicles' },
  { t: 'Approve winning bid',               s: 'Buyer settles within 48h · direct transfer' },
];

export function SellSection() {
  return (
    <section id="sell" className={`${styles.sec} ${styles.subtle}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-green">For Fleet Operators</div>
          <h2 className={`section-h2 ${styles.mb16}`}>Sell with FleetBid</h2>
          <p className={styles.body}>
            Dubai hosts over 5,000 rental operators refreshing fleets yearly. FleetBid aggregates
            structured weekly liquidation — giving you competitive, transparent pricing and
            guaranteed settlement.
          </p>
          <div className={styles.ctas} style={{ marginTop: 22, marginBottom: 0 }}>
            <Link href="/register?role=seller" className="btn btn-primary">List Your Vehicle</Link>
            <Link href="/how-it-works" className="btn btn-outline">Talk to Our Team</Link>
          </div>
          <div className={styles.sellStats}>
            {[
              ['5,000+', 'UAE rental operators'],
              ['Weekly',  'Structured auction events'],
              ['48h',     'Payment settlement'],
              ['850+',    'Active verified buyers'],
            ].map(([v, l]) => (
              <div key={l} className={styles.sellStat}>
                <div className={styles.sellStatVal}>{v}</div>
                <div className={styles.sellStatLbl}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sellCard}>
          <div className={styles.sellCardTitle}>How to List Your Vehicle</div>
          {SELL_STEPS.map((s, i) => (
            <div key={i} className={styles.step}>
              <div className={`${styles.num} ${styles.numGreen}`}>{i + 1}</div>
              <div>
                <div className={styles.stepTitle}>{s.t}</div>
                <div className={styles.stepSub}>{s.s}</div>
              </div>
            </div>
          ))}
          <Link href="/register?role=seller" className={`btn btn-primary btn-full ${styles.blockCta}`}>
            List Your Vehicle
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ══ §7 TRUST / FINAL CTA ══════════════════════════════════════════════════ */
const TRUST_ITEMS = [
  { icon: <IconEye size={16} color="#fff" />,      title: 'Transparent bidding process',  text: 'Full bid history visible. No hidden reserve. Real-time position updates.' },
  { icon: <IconShield size={16} color="#fff" />,   title: 'Verified fleet operators only', text: 'Every seller is a UAE-registered rental company.' },
  { icon: <IconCalendar size={16} color="#fff" />, title: 'Structured weekly events',      text: 'Predictable calendar. Plan your sourcing weeks in advance.' },
  { icon: <IconMapPin size={16} color="#fff" />,   title: 'Physical inspection access',    text: 'Viewing slots available 48h before every auction.' },
  { icon: <IconFile size={16} color="#fff" />,     title: 'Export-ready inventory',        text: 'Dubai Customs clearance on eligible lots. GCC and international.' },
];

export function TrustSection() {
  return (
    <section className={`${styles.sec} ${styles.dark}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-white">Why Choose Us</div>
          <h2 className={`section-h2 section-h2-white ${styles.mb16}`}>
            Built for Professional Buyers
          </h2>
          <p className={styles.bodyWhite} style={{ marginBottom: 28 }}>
            Every aspect of FleetBid is designed for institutional buyers who need reliable
            inventory, transparent process, and guaranteed execution.
          </p>
          <div className={styles.trustItems}>
            {TRUST_ITEMS.map((it, i) => (
              <div key={i} className={styles.trustRow}>
                <div className={styles.trustIco}>{it.icon}</div>
                <div>
                  <div className={styles.trustTitle}>{it.title}</div>
                  <div className={styles.trustText}>{it.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.ctaBox}>
          <div className={styles.ctaH3}>Create Your Account</div>
          <div className={styles.ctaSub}>
            Join 850+ verified fleet buyers. Registration takes under 5 minutes.
          </div>
          <Link href="/register" className="btn btn-primary btn-lg btn-full">
            Create Account
          </Link>
          <div className={styles.badges}>
            {[
              [<IconShield size={14} color="rgba(255,255,255,0.3)" />, 'UAE TRA Registered · TL-2022-88441'],
              [<IconZap    size={14} color="rgba(255,255,255,0.3)" />, 'SSL Secured · PCI-DSS via Stripe'],
              [<IconFile   size={14} color="rgba(255,255,255,0.3)" />, 'Legally binding terms — UAE law'],
              [<IconBuilding size={14} color="rgba(255,255,255,0.3)" />, 'Dubai Silicon Oasis · FZE entity'],
            ].map(([ico, txt], i) => (
              <div key={i} className={styles.badge}>
                <span className={styles.badgeIco}>{ico as React.ReactNode}</span>
                {txt as string}
              </div>
            ))}
          </div>
          <div className={styles.quote}>
            <div className={styles.quoteText}>
              "FleetBid gives us transparent, competitive pricing on fleet disposals.
              The process is clean and the buyers are serious."
            </div>
            <div className={styles.quoteAttr}>— Operations Director, Emirates Fleet Group</div>
          </div>
        </div>
      </div>
    </section>
  );
}
