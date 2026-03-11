// app/lot/[id]/not-found.tsx

import Link from 'next/link';

export default function LotNotFound() {
  return (
    <div
      style={{
        width: 'min(520px, calc(100% - 48px))',
        margin: '80px auto',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div style={{ fontSize: 48 }} aria-hidden>🔍</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink-primary)' }}>
        Lot Not Found
      </h1>
      <p style={{ fontSize: 15, color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
        This lot may have ended, been removed, or the link might be incorrect.
      </p>
      <Link
        href="/auctions"
        className="btn btn-primary"
        style={{ marginTop: 8 }}
      >
        Browse All Lots
      </Link>
    </div>
  );
}
