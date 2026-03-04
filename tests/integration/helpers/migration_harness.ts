import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_ROOT = path.resolve(process.cwd(), "prisma/migrations");

export type MigratedTestDb = {
  db: PGlite;
  appliedMigrations: string[];
  cleanup: () => Promise<void>;
};

async function discoverMigrationDirectories(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_ROOT, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function applyAllPrismaMigrations(db: PGlite): Promise<string[]> {
  const migrationDirectories = await discoverMigrationDirectories();
  const appliedMigrations: string[] = [];

  for (const migrationDirectory of migrationDirectories) {
    const migrationSqlPath = path.join(MIGRATIONS_ROOT, migrationDirectory, "migration.sql");
    const migrationSql = await readFile(migrationSqlPath, "utf8");

    await db.exec(migrationSql);
    appliedMigrations.push(migrationDirectory);
  }

  return appliedMigrations;
}

export async function createMigratedTestDb(): Promise<MigratedTestDb> {
  const dbPath = path.join(process.cwd(), ".tmp", `block2-db-${randomUUID()}`);
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = new PGlite(dbPath);
  const appliedMigrations = await applyAllPrismaMigrations(db);

  return {
    db,
    appliedMigrations,
    cleanup: async () => {
      await db.close();
      await rm(dbPath, { recursive: true, force: true });
    },
  };
}
