import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { CompaniesTable } from "./CompaniesTable";

export const dynamic = "force-dynamic";

type CompanyRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

function normalizeCompanyStatus(status: string): CompanyRow["status"] {
  if (status === "ACTIVE") {
    return "APPROVED";
  }

  if (status === "REJECTED" || status === "SUSPENDED") {
    return "REJECTED";
  }

  return "PENDING";
}

async function getCompanyRows(): Promise<CompanyRow[]> {
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const toCompanyRows = (
    companies: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: string;
      phone?: string | null;
      companyUsers?: Array<{
        userEmail?: string;
      }>;
    }>,
  ): CompanyRow[] =>
    companies.map((company) => ({
      id: company.id,
      name: company.name,
      email: company.companyUsers?.[0]?.userEmail ?? "-",
      phone: company.phone?.trim() || "-",
      status: normalizeCompanyStatus(company.status),
      createdAt: company.createdAt,
    }));

  try {
    const payload = await api.admin.companies.list<{
      companies?: Array<{
        id: string;
        name: string;
        status: string;
        createdAt: string;
        phone?: string | null;
        companyUsers?: Array<{
          userEmail?: string;
        }>;
      }>;
    }>(undefined, requestOptions);

    return toCompanyRows(payload.companies ?? []);
  } catch {
    const payload = await api.admin.companies.pending<{
      companies?: Array<{
        id: string;
        name: string;
        status: string;
        createdAt: string;
        companyUsers?: Array<{
          userEmail?: string;
        }>;
      }>;
    }>(requestOptions);

    return toCompanyRows(payload.companies ?? []);
  }
}

export default async function AdminCompaniesPage() {
  const companies = await getCompanyRows();

  return <CompaniesTable companies={companies} />;
}
