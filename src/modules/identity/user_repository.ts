import { randomUUID } from "node:crypto";

import { prismaSqlTransactionRunner } from "@/src/infrastructure/database/prisma_sql_runner";
import type { SqlRow, SqlTransactionRunner } from "@/src/lib/sql_contract";

export const userRoles = {
  buyer: "BUYER",
  seller: "SELLER",
  admin: "ADMIN",
  superAdmin: "SUPER_ADMIN",
} as const;

export type UserRole = (typeof userRoles)[keyof typeof userRoles];

export const userStatuses = {
  active: "ACTIVE",
  suspended: "SUSPENDED",
} as const;

export type UserStatus = (typeof userStatuses)[keyof typeof userStatuses];

export type IdentityUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  role?: UserRole;
  status?: UserStatus;
};

type UserRow = SqlRow & {
  id: unknown;
  email: unknown;
  passwordHash: unknown;
  role: unknown;
  status: unknown;
  createdAt: unknown;
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

function isUserRole(value: string): value is UserRole {
  return Object.values(userRoles).includes(value as UserRole);
}

function isUserStatus(value: string): value is UserStatus {
  return Object.values(userStatuses).includes(value as UserStatus);
}

function mapUserRow(row: UserRow): IdentityUser {
  const role = toNonEmptyString(row.role, "role");
  const status = toNonEmptyString(row.status, "status");

  if (!isUserRole(role)) {
    throw new Error(`Unexpected role value: ${role}`);
  }

  if (!isUserStatus(status)) {
    throw new Error(`Unexpected status value: ${status}`);
  }

  return {
    id: toNonEmptyString(row.id, "id"),
    email: toNonEmptyString(row.email, "email"),
    passwordHash: toNonEmptyString(row.passwordHash, "passwordHash"),
    role,
    status,
    createdAt: toDate(row.createdAt, "createdAt"),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type UserRepository = {
  createUser(input: CreateUserInput): Promise<IdentityUser>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  findUserById(id: string): Promise<IdentityUser | null>;
};

export function createUserRepository(
  transactionRunner: SqlTransactionRunner = prismaSqlTransactionRunner,
): UserRepository {
  return {
    async createUser(input: CreateUserInput): Promise<IdentityUser> {
      const email = normalizeEmail(input.email);
      const passwordHash = input.passwordHash.trim();

      if (email.length === 0) {
        throw new Error("email is required");
      }

      if (passwordHash.length === 0) {
        throw new Error("passwordHash is required");
      }

      const createdAt = new Date();
      const role = input.role ?? userRoles.buyer;
      const status = input.status ?? userStatuses.active;

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<UserRow>(
          `INSERT INTO "User" (
             "id",
             "email",
             "passwordHash",
             "role",
             "status",
             "createdAt"
           ) VALUES ($1, $2, $3, $4::"UserRole", $5::"UserStatus", $6::timestamptz)
           RETURNING
             "id",
             "email",
             "passwordHash",
             "role"::text AS "role",
             "status"::text AS "status",
             "createdAt"`,
          [randomUUID(), email, passwordHash, role, status, createdAt.toISOString()],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error("Failed to create user");
        }

        return mapUserRow(row);
      });
    },

    async findUserByEmail(email: string): Promise<IdentityUser | null> {
      const normalizedEmail = normalizeEmail(email);

      if (normalizedEmail.length === 0) {
        return null;
      }

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<UserRow>(
          `SELECT
             "id",
             "email",
             "passwordHash",
             "role"::text AS "role",
             "status"::text AS "status",
             "createdAt"
           FROM "User"
           WHERE lower("email") = $1
           LIMIT 1`,
          [normalizedEmail],
        );

        const row = result.rows[0];
        return row ? mapUserRow(row) : null;
      });
    },

    async findUserById(id: string): Promise<IdentityUser | null> {
      const normalizedId = id.trim();

      if (normalizedId.length === 0) {
        return null;
      }

      return transactionRunner.transaction(async (tx) => {
        const result = await tx.query<UserRow>(
          `SELECT
             "id",
             "email",
             "passwordHash",
             "role"::text AS "role",
             "status"::text AS "status",
             "createdAt"
           FROM "User"
           WHERE "id" = $1
           LIMIT 1`,
          [normalizedId],
        );

        const row = result.rows[0];
        return row ? mapUserRow(row) : null;
      });
    },
  };
}
