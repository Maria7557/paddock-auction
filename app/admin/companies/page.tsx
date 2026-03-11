import prisma from "@/src/lib/prisma";

import { CompaniesTable } from "./CompaniesTable";

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
  const companies = await prisma.company.findMany({
    include: {
      users: {
        include: {
          user: {
            select: {
              email: true,
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

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    email: company.users[0]?.user.email ?? "-",
    phone: "-",
    status: normalizeCompanyStatus(company.status),
    createdAt: company.createdAt.toISOString(),
  }));
}

export default async function AdminCompaniesPage() {
  const companies = await getCompanyRows();

  return <CompaniesTable companies={companies} />;
}
