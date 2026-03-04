import type { ComponentPropsWithoutRef, ElementType } from "react";

export type CardVariant = "surface" | "section" | "unstyled";

type CardBaseProps = {
  variant?: CardVariant;
  compact?: boolean;
  className?: string;
};

export type CardProps<T extends ElementType = "section"> = CardBaseProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof CardBaseProps | "as">;

export function Card<T extends ElementType = "section">({
  as,
  variant = "surface",
  compact = false,
  className,
  ...props
}: CardProps<T>) {
  const Component = (as ?? "section") as ElementType;
  const variantClass =
    variant === "section" ? "section-block" : variant === "surface" ? "surface-panel" : "";
  const compactClass = variant === "section" && compact ? "compact" : "";
  const classes = [variantClass, compactClass, className].filter(Boolean).join(" ");

  return <Component className={classes} {...props} />;
}
