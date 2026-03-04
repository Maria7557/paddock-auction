import type { HTMLAttributes } from "react";

export type PriceDisplayVariant = "currentBid" | "minimumStep" | "buyNow";

export type PriceDisplayProps = HTMLAttributes<HTMLDivElement> & {
  amountAed: number;
  label?: string;
  variant?: PriceDisplayVariant;
  locale?: string;
  currency?: string;
};

function formatCurrency(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const VALUE_CLASSNAME: Record<PriceDisplayVariant, string> = {
  currentBid: "lot-price-value",
  minimumStep: "lot-step-value",
  buyNow: "lot-buy-now-value",
};

export function PriceDisplay({
  amountAed,
  label,
  variant = "currentBid",
  className,
  locale = "en-AE",
  currency = "AED",
  ...props
}: PriceDisplayProps) {
  const classes = ["lot-price-col", className].filter(Boolean).join(" ");
  const valueClasses = VALUE_CLASSNAME[variant];

  return (
    <div className={classes} {...props}>
      {label ? <p className="lot-price-label">{label}</p> : null}
      <p className={valueClasses}>{formatCurrency(amountAed, locale, currency)}</p>
    </div>
  );
}
