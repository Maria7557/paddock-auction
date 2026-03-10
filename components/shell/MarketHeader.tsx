import Link from 'next/link';
import styles from './MarketHeader.module.css';

export default function MarketHeader() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <div className={styles.logoMark}>F</div>
          FleetBid
        </Link>

        {/* Nav */}
        <nav className={styles.nav}>
          <Link href="/auctions" className={styles.navLink}>Auctions</Link>
          <Link href="/how-it-works" className={styles.navLink}>How It Works</Link>
          <Link href="/#sell" className={styles.navLink}>Sell with Us</Link>
        </nav>

        {/* Auth CTAs */}
        <div className={styles.actions}>
          <Link href="/login" className={styles.loginBtn}>Sign In</Link>
          <Link href="/register" className={`btn btn-primary btn-sm ${styles.regBtn}`}>
            Register Company
          </Link>
        </div>
      </div>
    </header>
  );
}
