import styles from "./GlobalFooter.module.css";

import type { SupportedLocale } from "@/src/i18n/routing";

type Props = {
  locale?: SupportedLocale;
};

const COPY = {
  en: {
    desc: "UAE's structured B2B fleet vehicle auction platform. Operational rental inventory. Weekly events. Verified buyers.",
    platform: "Platform",
    sellers: "Sellers",
    legal: "Legal",
    platformLinks: ["Browse Auctions", "Schedule", "How It Works", "Categories"],
    sellerLinks: ["List Your Vehicle", "Seller FAQ", "Fleet Programs", "Contact Sales"],
    legalLinks: ["Auction Terms", "Privacy Policy", "Dispute Resolution", "Contact"],
    copyright: "© 2026 FleetBid Technologies FZE",
    location: "Dubai Silicon Oasis · UAE",
  },
  ru: {
    desc: "B2B-платформа еженедельных аукционов автопарков в ОАЭ. Рабочие машины из рентал-парков, верифицированные покупатели, прозрачные торги.",
    platform: "Платформа",
    sellers: "Продавцам",
    legal: "Юридическое",
    platformLinks: ["Все аукционы", "Расписание", "Как это работает", "Категории"],
    sellerLinks: ["Выставить автомобиль", "FAQ продавца", "Флит-программы", "Связаться с продажами"],
    legalLinks: ["Условия аукциона", "Политика конфиденциальности", "Разрешение споров", "Контакты"],
    copyright: "© 2026 FleetBid Technologies FZE",
    location: "Dubai Silicon Oasis · ОАЭ",
  },
} as const;

export default function GlobalFooter({ locale = "en" }: Props) {
  const t = COPY[locale];

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div>
          <div className={styles.logo}>
            <div className={styles.logoMark}>F</div>
            FleetBid
          </div>
          <p className={styles.desc}>{t.desc}</p>
          <div className={styles.vat}>TL: AE-DXB-2022-88441 · VAT: 100234567800003</div>
        </div>

        {[
          { title: t.platform, links: t.platformLinks },
          { title: t.sellers, links: t.sellerLinks },
          { title: t.legal, links: t.legalLinks },
        ].map((col) => (
          <div key={col.title}>
            <div className={styles.colTitle}>{col.title}</div>
            <div className={styles.links}>
              {col.links.map((link) => (
                <span key={link} className={styles.link}>
                  {link}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`container ${styles.bottom}`}>
        <span>{t.copyright}</span>
        <span>{t.location}</span>
      </div>
    </footer>
  );
}
