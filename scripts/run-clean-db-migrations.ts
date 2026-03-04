import { createMigratedTestDb } from "../tests/integration/helpers/migration_harness";

async function main(): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    console.log("Applied migrations on clean DB:");
    for (const migration of migratedDb.appliedMigrations) {
      console.log(`- ${migration}`);
    }
  } finally {
    await migratedDb.cleanup();
  }
}

main().catch((error) => {
  console.error("Failed to apply migrations on clean DB", error);
  process.exitCode = 1;
});
