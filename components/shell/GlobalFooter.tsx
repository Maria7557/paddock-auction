import Link from 'next/link';
import styles from './GlobalFooter.module.css';

export default function GlobalFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div>
          <div className={styles.logo}>
            <div className={styles.logoMark}>F</div>
            FleetBid
          </div>
          <p className={styles.desc}>
            UAE's structured B2B fleet vehicle auction platform.
            Operational rental inventory. Weekly events. Verified buyers.
          </p>
          <div className={styles.vat}>TL: AE-DXB-2022-88441 · VAT: 100234567800003</div>
        </div>

        {[
          { title: 'Platform', links: ['Browse Auctions', 'Schedule', 'How It Works', 'Categories'] },
          { title: 'Sellers',  links: ['List Your Vehicle', 'Seller FAQ', 'Fleet Programs', 'Contact Sales'] },
          { title: 'Legal',    links: ['Auction Terms', 'Privacy Policy', 'Dispute Resolution', 'Contact'] },
        ].map(col => (
          <div key={col.title}>
            <div className={styles.colTitle}>{col.title}</div>
            <div className={styles.links}>
              {col.links.map(l => <span key={l} className={styles.link}>{l}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div className={`container ${styles.bottom}`}>
        <span>© 2026 FleetBid Technologies FZE</span>
        <span>Dubai Silicon Oasis · UAE</span>
      </div>
    </footer>
  );
}
