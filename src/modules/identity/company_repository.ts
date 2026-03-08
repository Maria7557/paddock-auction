import { randomUUID } from "node:crypto";

import { prismaSqlTransactionRunner } from "@/src/infrastructure/database/prisma_sql_runner";
import type { SqlRow, SqlTransactionRunner } from "@/src/lib/sql_contract";

export const companyStatuses = {
  pending: "PENDING",
  active: "ACTIVE",
  suspended: "SUSPENDED",
} as const;

export type CompanyStatus = (typeof companyStatuses)[keyof typeof companyStatuses];

export const companyUserRoles = {
  owner: "OWNER",
  manager: "MANAGER",
  member: "MEMBER",
} as const;

export type CompanyUserRole = (typeof companyUserRoles)[keyof typeof companyUserRoles];

export type IdentityCompany = {
  id: string;
  name: string;
  country: string;
  registrationNumber: string;
  status: CompanyStatus;
  createdAt: Date;
};

export type IdentityCompanyUser = {
  id: string;
  userId: string;
  companyId: string;
  role: CompanyUserRole;
};

export type CreateCompanyInput = {
  name: string;
  country: string;
  registrationNumber: string;
  status?: CompanyStatus;
};

export type AddUserToCompanyInput = {
  userId: string;
  companyId: string;
  role?: CompanyUserRole;
};

type CompanyRow = SqlRow & {
  id: unknown;
  name: unknown;
  country: unknown;
  registrationNumber: unknown;
  status: unknown;
  createdAt: unknown;
};

type CompanyUserRow = SqlRow & {
  id: unknown;
  userId: unknown;
  companyId: unknown;
  role: unknown;
};

function toNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Expected non-empty string for ${fieldName}`);
}

function toDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new Error(`Expected valid date for ${fieldName}`);
}

function isCompanyStatus(value: string): value is CompanyStatus {
  return Object.values(companyStatuses).includes(value as CompanyStatus);
}

function isCompanyUserRole(value: string): value is CompanyUserRole {
  return Object.values(companyUserRoles).includes(value as CompanyUserRole);
}

function normalizeInput(value: string): string {
  return value.trim();
}

function mapCompanyRow(row: CompanyRow): IdentityCompany {
  const status = toNonEmptyString(row.status, "status");

  if (!isCompanyStatus(status)) {
    throw new Error(`Unexpected company status: ${status}`);
  }

  return {
    id: toNonEmptyString(row.id, "id"),
    name: toNonEmptyString(row.name, "name"),
    country: toNonEmptyString(row.country, "country"),
    registrationNumber: toNonEmptyString(row.registrationNumber, "registrationNumber"),
    status,
    createdAt: toDate(row.createdAt, "createdAt"),
  };
}

function mapCompanyUserRow(row: CompanyUserRow): IdentityCompanyUser {
  const role = toNonEmptyString(row.role, "role");

  if (!isCompanyUserRole(role)) {
    throw new Error(`Unexpected company user role: ${role}`);
  }

  return {
    id: toNonEmptyString(row.id, "id"),
    userId: toNonEmptyString(row.userId, "userId"),
    companyId: toNonEmptyString(row.companyId, "companyId"),
    role,
  };
}

export type CompanyRepository = {
  createCompany(input: CreateCompanyInput): Promise<IdentityCompany>;
  addUserToCompany(input: AddUserToCompanyInput): Promise<IdentityCompanyUser>;
  findCompanyById(companyId: string): Promise<IdentityCompany | null>;
};

export function createCompanyRepository(
  transactionRunner: SqlTransactionRunner = prismaSqlTransactionRunner,
): CompanyRepository {
  return {
    async createCompany(input: CreateCompanyInput): Promise<IdentityCompany> {
      const name = normalizeInput(input.name);
      const country = normalizeInput(input.country);
      const registrationNumber = normalizeInput(input.registrationNumber);
      const status = input.status ?? companyStatuses.pending;

      if (name.length === 0) {
        throw new Error("name is required");
      }

      if (country.length === 0) {
        throw new Error("country is required");
      }

      if (registrationNumber.length === 0) {
        throw new Error("registrationNumber is required");
      }

      const createdAt = new Date();

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<CompanyRow>(
          `INSERT INTO "Company" (
             "id",
             "name",
             "country",
             "registrationNumber",
             "status",
             "createdAt"
           ) VALUES ($1, $2, $3, $4, $5::"CompanyStatus", $6::timestamptz)
           RETURNING
             "id",
             "name",
             "country",
             "registrationNumber",
             "status"::text AS "status",
             "createdAt"`,
          [randomUUID(), name, country, registrationNumber, status, createdAt.toISOString()],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error("Failed to create company");
        }

        return mapCompanyRow(row);
      });
    },

    async addUserToCompany(input: AddUserToCompanyInput): Promise<IdentityCompanyUser> {
      const userId = normalizeInput(input.userId);
      const companyId = normalizeInput(input.companyId);
      const role = input.role ?? companyUserRoles.member;

      if (userId.length === 0) {
        throw new Error("userId is required");
      }

      if (companyId.length === 0) {
        throw new Error("companyId is required");
      }

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<CompanyUserRow>(
          `INSERT INTO "CompanyUser" (
             "id",
             "userId",
             "companyId",
             "role"
           ) VALUES ($1, $2, $3, $4::"CompanyUserRole")
           RETURNING
             "id",
             "userId",
             "companyId",
             "role"::text AS "role"`,
          [randomUUID(), userId, companyId, role],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error("Failed to add user to company");
        }

        return mapCompanyUserRow(row);
      });
    },

    async findCompanyById(companyId: string): Promise<IdentityCompany | null> {
      const normalizedCompanyId = normalizeInput(companyId);

      if (normalizedCompanyId.length === 0) {
        return null;
      }

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<CompanyRow>(
          `SELECT
             "id",
             "name",
             "country",
             "registrationNumber",
             "status"::text AS "status",
             "createdAt"
           FROM "Company"
           WHERE "id" = $1
           LIMIT 1`,
          [normalizedCompanyId],
        );

        const row = result.rows[0];
        return row ? mapCompanyRow(row) : null;
      });
    },
  };
}
