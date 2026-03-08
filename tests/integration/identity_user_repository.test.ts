import assert from "node:assert/strict";
import test from "node:test";

import {
  createUserRepository,
  userRoles,
  userStatuses,
} from "../../src/modules/identity/user_repository";
import { createMigratedTestDb } from "./helpers/migration_harness";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";

async function withMigratedDb(
  assertion: (context: Awaited<ReturnType<typeof createMigratedTestDb>>) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion(migratedDb);
  } finally {
    await migratedDb.cleanup();
  }
}

test("createUser persists user with defaults", async () => {
  await withMigratedDb(async ({ db }) => {
    const repository = createUserRepository(createPgliteTransactionRunner(db));

    const created = await repository.createUser({
      email: "ops@fleetbid.com",
      passwordHash: "hashed-password",
    });

    assert.ok(created.id.length > 0);
    assert.equal(created.email, "ops@fleetbid.com");
    assert.equal(created.passwordHash, "hashed-password");
    assert.equal(created.role, userRoles.buyer);
    assert.equal(created.status, userStatuses.active);
    assert.ok(created.createdAt instanceof Date);
  });
});

test("findUserByEmail returns user when found", async () => {
  await withMigratedDb(async ({ db }) => {
    const repository = createUserRepository(createPgliteTransactionRunner(db));

    const created = await repository.createUser({
      email: "seller@fleetbid.com",
      passwordHash: "hashed-password-2",
      role: userRoles.seller,
    });

    const found = await repository.findUserByEmail("SELLER@fleetbid.com");

    assert.ok(found);
    assert.equal(found?.id, created.id);
    assert.equal(found?.role, userRoles.seller);
  });
});

test("findUserById returns null for missing user", async () => {
  await withMigratedDb(async ({ db }) => {
    const repository = createUserRepository(createPgliteTransactionRunner(db));

    const missing = await repository.findUserById("missing-user-id");

    assert.equal(missing, null);
  });
});
