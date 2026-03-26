import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { SignJWT } from "jose";
import supertest from "supertest";
import { vi } from "vitest";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = process.cwd();
const PRISMA_SCHEMA_PATH = resolve(BACKEND_ROOT, "..", "prisma", "schema.prisma");
const DEFAULT_JWT_SECRET = "test-secret-32-chars-long-enough!!";

let envLoaded = false;

type GlobalForPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};

export type IntegrationTestDatabase = {
  schemaName: string;
  schemaUrl: string;
  prisma: PrismaClient;
  createClient: () => PrismaClient;
  reset: () => Promise<void>;
  cleanup: () => Promise<void>;
};

export type BackendRuntime = {
  buildServer: () => Promise<FastifyInstance>;
  closeExpiredAuctions: () => Promise<void>;
  enforcePaymentDeadlines: () => Promise<void>;
  disconnect: () => Promise<void>;
};

function loadEnvironment(): void {
  if (envLoaded) {
    return;
  }

  config({ path: resolve(BACKEND_ROOT, ".env"), quiet: true });

  if (!process.env.DATABASE_URL) {
    config({ path: resolve(BACKEND_ROOT, "..", ".env"), quiet: true });
  }

  envLoaded = true;
}

function requireDatabaseUrl(): string {
  loadEnvironment();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured for integration tests");
  }

  return databaseUrl;
}

function withSchema(databaseUrl: string, schemaName: string): string {
  const parsed = new URL(databaseUrl);

  parsed.searchParams.set("schema", schemaName);

  return parsed.toString();
}

function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

async function syncSchema(databaseUrl: string): Promise<void> {
  await execFileAsync(
    "npx",
    ["prisma", "db", "push", "--schema", PRISMA_SCHEMA_PATH, "--skip-generate"],
    {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

function buildSchemaName(prefix: string): string {
  const normalizedPrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);

  return `it_${normalizedPrefix || "test"}_${suffix}`.slice(0, 63);
}

async function truncateAllTables(prisma: PrismaClient, schemaName: string): Promise<void> {
  const tableRows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename ASC
  `;

  if (tableRows.length === 0) {
    return;
  }

  const qualifiedTableNames = tableRows
    .map(({ tablename }) => `"${schemaName}"."${tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${qualifiedTableNames} RESTART IDENTITY CASCADE`,
  );
}

export async function createIntegrationTestDatabase(
  prefix: string,
): Promise<IntegrationTestDatabase> {
  const databaseUrl = requireDatabaseUrl();
  const schemaName = buildSchemaName(prefix);
  const adminUrl = withSchema(databaseUrl, "public");
  const schemaUrl = withSchema(databaseUrl, schemaName);
  const adminPrisma = createPrismaClient(adminUrl);

  await adminPrisma.$connect();

  try {
    await adminPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await syncSchema(schemaUrl);
  } catch (error) {
    await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPrisma.$disconnect();
    throw error;
  }

  const prisma = createPrismaClient(schemaUrl);
  await prisma.$connect();

  return {
    schemaName,
    schemaUrl,
    prisma,
    createClient: () => createPrismaClient(schemaUrl),
    reset: async () => {
      await truncateAllTables(prisma, schemaName);
    },
    cleanup: async () => {
      await prisma.$disconnect();
      await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPrisma.$disconnect();
    },
  };
}

function clearGlobalPrisma(): void {
  delete (globalThis as GlobalForPrisma).prisma;
}

export async function loadBackendRuntime(schemaUrl: string): Promise<BackendRuntime> {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
  process.env.DATABASE_URL = schemaUrl;

  clearGlobalPrisma();
  vi.resetModules();

  const [{ buildServer }, schedulerModule, dbModule] = await Promise.all([
    import("../../../server"),
    import("../../../scheduler"),
    import("../../../db"),
  ]);

  await schedulerModule.setSchedulerLogger({
    info() {
      return;
    },
    error() {
      return;
    },
  });

  return {
    buildServer,
    closeExpiredAuctions: schedulerModule.closeExpiredAuctions,
    enforcePaymentDeadlines: schedulerModule.enforcePaymentDeadlines,
    disconnect: async () => {
      await dbModule.disconnectPrisma();
      clearGlobalPrisma();
      vi.resetModules();
    },
  };
}

export async function createServerForSchema(schemaUrl: string): Promise<{
  server: FastifyInstance;
  request: ReturnType<typeof supertest>;
  close: () => Promise<void>;
}> {
  const runtime = await loadBackendRuntime(schemaUrl);
  const server = await runtime.buildServer();

  if ("level" in server.log) {
    server.log.level = "silent";
  }

  await server.ready();

  return {
    server,
    request: supertest(server.server),
    close: async () => {
      await server.close();
      await runtime.disconnect();
    },
  };
}

export async function signAccessToken(payload: {
  userId: string;
  role: string;
  companyId?: string;
  kycVerified?: boolean;
}): Promise<string> {
  const secret = new TextEncoder().encode(DEFAULT_JWT_SECRET);

  return new SignJWT({
    role: payload.role,
    companyId: payload.companyId,
    kycVerified: payload.kycVerified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}
