import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

export type BuyerSession = {
  userId: string;
  email: string;
  companyId: string | null;
  companyName: string | null;
  companyPhone: string | null;
  companyRegistrationNumber: string | null;
  companyCountry: string | null;
  companyCreatedAt: string | null;
  buyerTier: "STANDARD" | "VIP";
  userStatus: string;
  companyStatus: string | null;
  kycVerified: boolean;
};

function loginRedirect(nextPath: string): never {
  redirect(`/login/buyer?next=${encodeURIComponent(nextPath)}`);
}

export async function requireBuyerSession(nextPath: string): Promise<BuyerSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    loginRedirect(nextPath);
  }

  const response = await api.auth.me<{
    user?: {
      id?: string;
      email?: string;
      role?: string;
      status?: string;
      createdAt?: string;
      kycVerified?: boolean;
      companyUsers?: Array<{
        companyId?: string;
        role?: string;
        company?: {
          name?: string;
          phone?: string | null;
          registrationNumber?: string | null;
          country?: string | null;
          buyerTier?: "STANDARD" | "VIP" | null;
          status?: string;
          createdAt?: string | null;
        } | null;
      }>;
    };
  }>(await withServerCookies({ cache: "no-store" })).catch(() => null);

  if (response?.user?.role !== "BUYER") {
    loginRedirect(nextPath);
  }

  const companyUser = response.user.companyUsers?.find(
    (candidate) => candidate.role === "BUYER_BIDDER" && candidate.companyId,
  );
  const userId = response.user.id?.trim();
  const email = response.user.email?.trim();
  const userStatus = response.user.status?.trim();
  const companyId = companyUser?.companyId?.trim() ?? null;
  const companyName = companyUser?.company?.name?.trim() ?? null;
  const companyPhone = companyUser?.company?.phone?.trim() ?? null;
  const companyRegistrationNumber = companyUser?.company?.registrationNumber?.trim() ?? null;
  const companyCountry = companyUser?.company?.country?.trim() ?? null;
  const companyStatus = companyUser?.company?.status?.trim() ?? null;
  const companyCreatedAt = companyUser?.company?.createdAt?.trim() ?? null;
  const buyerTier = companyUser?.company?.buyerTier === "VIP" ? "VIP" : "STANDARD";

  if (!userId || !email || !userStatus) {
    loginRedirect(nextPath);
  }

  return {
    userId,
    email,
    companyId,
    companyName,
    companyPhone,
    companyRegistrationNumber,
    companyCountry,
    companyCreatedAt,
    buyerTier,
    userStatus,
    companyStatus,
    kycVerified: response.user.kycVerified === true,
  };
}
