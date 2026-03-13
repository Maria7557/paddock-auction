import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { BuyersTable } from "./BuyersTable";

export const dynamic = "force-dynamic";

type DepositStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

type BuyerRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  depositStatus: DepositStatus;
  amountAed: number;
};

function toNumber(value: { toString(): string } | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

function resolveDepositStatus(
  userStatus: string,
  kycVerified: boolean,
  walletBalanceAed: number,
): DepositStatus {
  if (userStatus === "REJECTED") {
    return "REJECTED";
  }

  if (kycVerified) {
    return "APPROVED";
  }

  if (walletBalanceAed > 0) {
    return "PENDING";
  }

  return "NONE";
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
  const statuses = ["ACTIVE", "PENDING_APPROVAL", "BLOCKED", "PENDING_KYC"] as const;
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
          companyUsers?: Array<{
            companyName?: string;
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
      companyUsers?: Array<{
        companyName?: string;
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

  return [...usersById.values()].map((user) => {
    const amountAed = toNumber(user.walletBalance ?? null);

    return {
      id: user.id,
      name: inferName(user.email),
      phone: "-",
      email: user.email,
      company: user.companyUsers?.[0]?.companyName ?? "-",
      depositStatus: resolveDepositStatus(user.status, user.kycVerified, amountAed),
      amountAed,
    };
  });
}

export default async function AdminBuyersPage() {
  const buyers = await getBuyerRows();

  return <BuyersTable buyers={buyers} />;
}
