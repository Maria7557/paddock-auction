import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

export type SellerSession = {
  userId: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
};

function loginRedirect(nextPath: string): never {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function requireSellerSession(nextPath: string): Promise<SellerSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    loginRedirect(nextPath);
  }

  const response = await api.auth.me<{
    user?: {
      id?: string;
      role?: string;
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

  if (response?.user?.role !== "SELLER") {
    loginRedirect(nextPath);
  }

  const companyUser = response.user.companyUsers?.find(
    (candidate) => candidate.companyId && candidate.role === "SELLER_MANAGER",
  );
  const companyId = companyUser?.companyId?.trim();
  const company = companyUser?.company;
  const companyName = company?.name?.trim();
  const companyStatus = company?.status?.trim();
  const userId = response.user.id?.trim();

  if (!userId || !companyId || !companyName || !companyStatus) {
    loginRedirect(nextPath);
  }

  return {
    userId,
    companyId,
    companyName,
    companyStatus,
  };
}
