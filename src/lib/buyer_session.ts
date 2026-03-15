import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

export type BuyerSession = {
  userId: string;
  companyId: string | null;
  companyName: string | null;
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
      role?: string;
      status?: string;
      kycVerified?: boolean;
      companyUsers?: Array<{
        companyId?: string;
        role?: string;
        company?: {
          name?: string;
          status?: string;
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
  const userStatus = response.user.status?.trim();
  const companyId = companyUser?.companyId?.trim() ?? null;
  const companyName = companyUser?.company?.name?.trim() ?? null;
  const companyStatus = companyUser?.company?.status?.trim() ?? null;

  if (!userId || !userStatus) {
    loginRedirect(nextPath);
  }

  return {
    userId,
    companyId,
    companyName,
    userStatus,
    companyStatus,
    kycVerified: response.user.kycVerified === true,
  };
}
