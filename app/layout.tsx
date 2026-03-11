import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import MarketHeader from "@/components/shell/MarketHeader";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/src/i18n/routing";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Paddock UAE Vehicle Auctions",
    template: "%s | Paddock UAE Vehicle Auctions",
  },
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
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}>
        <MarketHeader />
        {children}
      </body>
    </html>
  );
}
