import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";

import GlobalFooter from "@/components/shell/GlobalFooter";
import MarketHeader from "@/components/shell/MarketHeader";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/src/i18n/routing";
import "./globals.css";

const localFontVariables = {
  "--font-space-grotesk": "\"Segoe UI\", sans-serif",
  "--font-ibm-plex-mono": "\"SF Mono\", monospace",
} as CSSProperties;

export const metadata: Metadata = {
  title: {
    default: "FleetBid UAE Vehicle Auctions",
    template: "%s | FleetBid UAE Vehicle Auctions",
  },
  applicationName: "FleetBid",
  description:
    "Production B2B vehicle marketplace for UAE with trusted live auctions, deposit-gated bidding, and fast settlement UX.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("fb_locale")?.value;
  const locale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;

  return (
    <html lang={locale}>
      <body className="antialiased" style={localFontVariables}>
        <MarketHeader />
        {children}
        <GlobalFooter locale={locale} />
      </body>
    </html>
  );
}
