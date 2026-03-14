import Link from "next/link";
import { cookies } from "next/headers";

import { LocaleCurrencyControls } from "@/components/shell/LocaleCurrencyControls";
import { DEFAULT_LOCALE, isSupportedLocale, withLocalePath } from "@/src/i18n/routing";
import { resolveDisplayCurrency } from "@/src/lib/money";

import styles from "./MarketHeader.module.css";

const COPY = {
  en: {
    auctions: "Auctions",
    how: "How It Works",
    sell: "Sell with Us",
    signIn: "Sign In",
    register: "Register Company",
    language: "Select language",
    currency: "Select currency",
    english: "EN",
    russian: "RU",
  },
  ru: {
    auctions: "Аукционы",
    how: "Как это работает",
    sell: "Продать с нами",
    signIn: "Войти",
    register: "Регистрация компании",
    language: "Выбор языка",
    currency: "Выбор валюты",
    english: "EN",
    russian: "RU",
  },
} as const;

export default async function MarketHeader() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("fb_locale")?.value;
  const locale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
  const currency = resolveDisplayCurrency(cookieStore.get("fb_currency")?.value);

  const t = COPY[locale];

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href={withLocalePath("/", locale)} className={styles.logo}>
          <div className={styles.logoMark}>F</div>
          FleetBid
        </Link>

        <nav className={styles.nav}>
          <Link href={withLocalePath("/auctions", locale)} className={styles.navLink}>
            {t.auctions}
          </Link>
          <Link href={`${withLocalePath("/", locale)}#how-it-works`} className={styles.navLink}>
            {t.how}
          </Link>
          <Link href={`${withLocalePath("/", locale)}#sell`} className={styles.navLink}>
            {t.sell}
          </Link>
        </nav>

        <div className={styles.actions}>
          <LocaleCurrencyControls
            locale={locale}
            currency={currency}
            labels={{
              language: t.language,
              currency: t.currency,
              english: t.english,
              russian: t.russian,
            }}
          />

          <Link href="/login" className={styles.loginBtn}>
            {t.signIn}
          </Link>
          <Link href="/register" className={`btn btn-primary btn-sm ${styles.regBtn}`}>
            {t.register}
          </Link>
        </div>
      </div>
    </header>
  );
}
