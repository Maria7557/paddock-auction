import prisma from "@/src/lib/prisma";

import { BuyersTable } from "./BuyersTable";

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
  const users = await prisma.user.findMany({
    where: {
      role: "BUYER",
    },
    include: {
      wallet: {
        select: {
          balance: true,
        },
      },
      companyUsers: {
        include: {
          company: {
            select: {
              name: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users.map((user) => {
    const amountAed = toNumber(user.wallet?.balance ?? null);

    return {
      id: user.id,
      name: inferName(user.email),
      phone: "-",
      email: user.email,
      company: user.companyUsers[0]?.company.name ?? "-",
      depositStatus: resolveDepositStatus(user.status, user.kycVerified, amountAed),
      amountAed,
    };
  });
}

export default async function AdminBuyersPage() {
  const buyers = await getBuyerRows();

  return <BuyersTable buyers={buyers} />;
}
