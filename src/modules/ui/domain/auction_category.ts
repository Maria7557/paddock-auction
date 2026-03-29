import type { SupportedLocale } from "@/src/i18n/routing";

export const AUCTION_CATEGORY_ORDER = ["luxury", "suv", "sedan", "sports"] as const;

export type AuctionCategory = (typeof AUCTION_CATEGORY_ORDER)[number];

export const AUCTION_CATEGORY_LABELS: Record<AuctionCategory, string> = {
  luxury: "Luxury Fleet",
  suv: "SUV Inventory",
  sedan: "Fleet Sedans",
  sports: "Sports & Coupes",
};

export const AUCTION_CATEGORY_LABELS_RU: Record<AuctionCategory, string> = {
  luxury: "Премиум-класс",
  suv: "SUV",
  sedan: "Седаны",
  sports: "Спорт и купе",
};

export function isAuctionCategory(value: string): value is AuctionCategory {
  return AUCTION_CATEGORY_ORDER.includes(value as AuctionCategory);
}

export function inferAuctionCategory(make: string, bodyType: string): AuctionCategory {
  const normalizedMake = make.toLowerCase();
  const normalizedBody = bodyType.toLowerCase();

  if (normalizedBody.includes("suv")) {
    return "suv";
  }

  if (
    ["bentley", "ferrari", "lamborghini", "rolls-royce", "mclaren", "maserati"].some((brand) =>
      normalizedMake.includes(brand),
    )
  ) {
    return "luxury";
  }

  if (normalizedBody.includes("coupe") || normalizedBody.includes("sport")) {
    return "sports";
  }

  return "sedan";
}

export function getAuctionCategoryLabel(category: AuctionCategory, locale: SupportedLocale = "en"): string {
  return locale === "ru" ? AUCTION_CATEGORY_LABELS_RU[category] : AUCTION_CATEGORY_LABELS[category];
}
