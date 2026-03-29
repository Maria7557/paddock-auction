import type { SupportedLocale } from "@/src/i18n/routing";

export type InvoiceStatus = "ISSUED" | "PAID_PENDING_CONFIRMATION" | "PAID" | "DEFAULTED" | "CANCELED";

export type InvoiceSummaryViewModel = {
  id: string;
  auctionId: string;
  lotNumber: string;
  lotTitle: string;
  totalAed: number;
  dueAt: string;
  status: InvoiceStatus;
};

export type PaymentPendingInvoiceViewModel = InvoiceSummaryViewModel & {
  winnerCompany: string;
};

export type InvoiceDetailViewModel = PaymentPendingInvoiceViewModel & {
  winningAmountAed: number;
  commissionAed: number;
  vatAed: number;
  issuedAt: string;
  stripePaymentIntentId: string | null;
};

export function formatAed(amountAed: number, locale: SupportedLocale = "en"): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(amountAed);
}

export function formatShortDateTime(isoDate: string, locale: SupportedLocale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function formatLongDate(isoDate: string, locale: SupportedLocale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-AE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

export function getInvoiceDeadlineTone(
  dueAt: string,
  status: InvoiceStatus,
  now = new Date(),
): "normal" | "warning" | "critical" | "resolved" {
  if (status !== "ISSUED") {
    return "resolved";
  }

  const diffHours = (new Date(dueAt).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 12) {
    return "critical";
  }

  if (diffHours <= 24) {
    return "warning";
  }

  return "normal";
}

export function describeInvoiceDeadline(
  dueAt: string,
  status: InvoiceStatus,
  now = new Date(),
  locale: SupportedLocale = "en",
): string {
  if (status === "PAID" || status === "PAID_PENDING_CONFIRMATION") {
    return locale === "ru" ? "Оплачено в установленный срок" : "Settled within the policy window";
  }

  if (status === "CANCELED") {
    return locale === "ru" ? "Отменено" : "Canceled";
  }

  if (status === "DEFAULTED") {
    return locale === "ru" ? "Просрочено по платежной политике" : "Defaulted under payment policy";
  }

  const diffMs = new Date(dueAt).getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours <= 0) {
    return locale === "ru" ? "Срок оплаты истек" : "Deadline exceeded";
  }

  return locale === "ru" ? `Осталось ${diffHours} ч` : `${diffHours}h remaining`;
}
