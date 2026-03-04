import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const VARIANT_CLASSNAME: Record<ButtonVariant, string> = {
  primary: "button-primary",
  secondary: "button-secondary",
  ghost: "button-ghost",
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  const classes = ["button", VARIANT_CLASSNAME[variant], className].filter(Boolean).join(" ");

  return <button type={type} className={classes} {...props} />;
}
