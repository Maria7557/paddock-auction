import { Prisma, type Wallet } from "@prisma/client";
import { z } from "zod";

type WalletValue = Prisma.Decimal | number | string;

type WalletLike = {
  id: string;
  userId: string;
  balance: WalletValue;
  lockedBalance: WalletValue;
};

export type WalletDto = {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
};

export const walletMutationPayloadSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  user_id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

export type WalletMutationPayload = z.infer<typeof walletMutationPayloadSchema>;

function cleanOptionalValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveWalletUserId(request: Request, payload?: Partial<WalletMutationPayload>): string | null {
  const url = new URL(request.url);

  return (
    cleanOptionalValue(url.searchParams.get("user_id")) ??
    cleanOptionalValue(url.searchParams.get("userId")) ??
    cleanOptionalValue(request.headers.get("x-user-id")) ??
    cleanOptionalValue(request.headers.get("user-id")) ??
    cleanOptionalValue(payload?.user_id) ??
    cleanOptionalValue(payload?.userId) ??
    null
  );
}

function toMoneyNumber(value: WalletValue): number {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return value;
}

function normalizeMoneyNumber(amount: number): number {
  return Number(amount.toFixed(2));
}

export function normalizeMoneyDecimal(amount: number): Prisma.Decimal {
  const normalized = normalizeMoneyNumber(amount);
  return new Prisma.Decimal(normalized.toFixed(2));
}

export function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => issue.message).join("; ");
}

export function mapWalletDto(wallet: WalletLike | Pick<Wallet, "id" | "userId" | "balance" | "lockedBalance">): WalletDto {
  const balance = normalizeMoneyNumber(toMoneyNumber(wallet.balance));
  const lockedBalance = normalizeMoneyNumber(toMoneyNumber(wallet.lockedBalance));

  return {
    id: wallet.id,
    userId: wallet.userId,
    balance,
    lockedBalance,
    availableBalance: normalizeMoneyNumber(balance - lockedBalance),
  };
}
