import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";
import { getLocalePreference } from "@/src/lib/display_preferences";

import { BuyersTable } from "./BuyersTable";

export const dynamic = "force-dynamic";

type AccountStatus = "PENDING_APPROVAL" | "ACTIVE" | "BLOCKED" | "REJECTED";

type BuyerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  accountStatus: AccountStatus;
  amountAed: number;
  createdAt: string;
};

function toNumber(value: { toString(): string } | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

function inferName(email: string): string {
  const localPart = email.split("@")[0] ?? "buyer";
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1));

  return words.length > 0 ? words.join(" ") : "Buyer";
}

async function getBuyerRows(): Promise<BuyerRow[]> {
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const statuses = ["ACTIVE", "PENDING_APPROVAL", "BLOCKED", "REJECTED", "PENDING_KYC"] as const;
  const responses = await Promise.all(
    statuses.map((status) =>
      api.admin.users.pending<{
        users?: Array<{
          id: string;
          email: string;
          role: string;
          status: string;
          kycVerified: boolean;
          walletBalance?: number | null;
          createdAt: string;
          companyUsers?: Array<{
            companyPhone?: string | null;
          }>;
        }>;
      }>({ status }, requestOptions).catch(() => ({ users: [] })),
    ),
  );
  const usersById = new Map<
    string,
    {
      id: string;
      email: string;
      role: string;
      status: string;
      kycVerified: boolean;
      walletBalance?: number | null;
      createdAt: string;
      companyUsers?: Array<{
        companyPhone?: string | null;
      }>;
    }
  >();

  for (const response of responses) {
    for (const user of response.users ?? []) {
      if (user.role !== "BUYER") {
        continue;
      }

      usersById.set(user.id, user);
    }
  }

  return [...usersById.values()].map((user: { id: string; email: string; role: string; status: string; kycVerified: boolean; walletBalance?: number | null; createdAt: string; companyUsers?: Array<{ companyPhone?: string | null }> }) => {
    const amountAed = toNumber(user.walletBalance ?? null);
    const phone = user.companyUsers?.find((membership) => membership.companyPhone?.trim())?.companyPhone?.trim() || "-";

    return {
      id: user.id,
      name: inferName(user.email),
      phone,
      email: user.email,
      accountStatus: user.status as AccountStatus,
      amountAed,
      createdAt: user.createdAt,
    };
  });
}

export default async function AdminBuyersPage() {
  const buyers = await getBuyerRows();
  const locale = await getLocalePreference();

  return <BuyersTable buyers={buyers} locale={locale} />;
}
