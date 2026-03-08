import assert from "node:assert/strict";
import test from "node:test";

import type {
  SqlClient,
  SqlQueryResult,
  SqlRow,
  SqlTransactionRunner,
} from "@/src/lib/sql_contract";
import {
  createUserRepository,
  userRoles,
  userStatuses,
} from "./user_repository";

type QueryResponder = (sql: string, params: readonly unknown[]) => Promise<{ rows: SqlRow[] }>;

function createMockTransactionRunner(responder: QueryResponder): SqlTransactionRunner {
  return {
    async transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T> {
      const tx: SqlClient = {
        query: async <T extends SqlRow = SqlRow>(
          sql: string,
          params: readonly unknown[] = [],
        ): Promise<SqlQueryResult<T>> => {
          const result = await responder(sql, params);
          return {
            rows: result.rows as T[],
          };
        },
      };

      return handler(tx);
    },
  };
}

test("createUser inserts normalized email and returns mapped user", async () => {
  let capturedSql = "";
  let capturedParams: readonly unknown[] = [];

  const repository = createUserRepository(
    createMockTransactionRunner(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;

      return {
        rows: [
          {
            id: "user-1",
            email: "buyer@fleetbid.com",
            passwordHash: "hash-1",
            role: "BUYER",
            status: "ACTIVE",
            createdAt: "2026-03-05T10:00:00.000Z",
          },
        ],
      };
    }),
  );

  const created = await repository.createUser({
    email: "  BUYER@FleetBid.com  ",
    passwordHash: "hash-1",
  });

  assert.match(capturedSql, /INSERT INTO "User"/);
  assert.equal(capturedParams[1], "buyer@fleetbid.com");
  assert.equal(capturedParams[2], "hash-1");
  assert.equal(capturedParams[3], userRoles.buyer);
  assert.equal(capturedParams[4], userStatuses.active);

  assert.equal(created.id, "user-1");
  assert.equal(created.email, "buyer@fleetbid.com");
  assert.equal(created.passwordHash, "hash-1");
  assert.equal(created.role, userRoles.buyer);
  assert.equal(created.status, userStatuses.active);
  assert.ok(created.createdAt instanceof Date);
});

test("findUserByEmail normalizes input and returns null for blank email", async () => {
  let queryCalls = 0;

  const repository = createUserRepository(
    createMockTransactionRunner(async (_sql, params) => {
      queryCalls += 1;
      assert.equal(params[0], "seller@fleetbid.com");

      return {
        rows: [
          {
            id: "user-2",
            email: "seller@fleetbid.com",
            passwordHash: "hash-2",
            role: "SELLER",
            status: "ACTIVE",
            createdAt: "2026-03-05T11:00:00.000Z",
          },
        ],
      };
    }),
  );

  const found = await repository.findUserByEmail("  SELLER@FleetBid.com ");

  assert.ok(found);
  assert.equal(found?.role, userRoles.seller);
  assert.equal(queryCalls, 1);

  const blankResult = await repository.findUserByEmail("   ");
  assert.equal(blankResult, null);
  assert.equal(queryCalls, 1);
});

test("findUserById returns mapped user and null for blank id", async () => {
  const repository = createUserRepository(
    createMockTransactionRunner(async (_sql, params) => {
      assert.equal(params[0], "user-3");

      return {
        rows: [
          {
            id: "user-3",
            email: "admin@fleetbid.com",
            passwordHash: "hash-3",
            role: "ADMIN",
            status: "SUSPENDED",
            createdAt: "2026-03-05T12:00:00.000Z",
          },
        ],
      };
    }),
  );

  const found = await repository.findUserById("  user-3 ");

  assert.ok(found);
  assert.equal(found?.role, userRoles.admin);
  assert.equal(found?.status, userStatuses.suspended);

  const blankResult = await repository.findUserById("  ");
  assert.equal(blankResult, null);
});
