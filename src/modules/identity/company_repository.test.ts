import assert from "node:assert/strict";
import test from "node:test";

import type {
  SqlClient,
  SqlQueryResult,
  SqlRow,
  SqlTransactionRunner,
} from "@/src/lib/sql_contract";
import {
  companyStatuses,
  companyUserRoles,
  createCompanyRepository,
} from "./company_repository";

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

test("createCompany inserts company and applies pending default status", async () => {
  let capturedSql = "";
  let capturedParams: readonly unknown[] = [];

  const repository = createCompanyRepository(
    createMockTransactionRunner(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;

      return {
        rows: [
          {
            id: "company-1",
            name: "FleetBid Trading LLC",
            country: "UAE",
            registrationNumber: "REG-001",
            status: "PENDING",
            createdAt: "2026-03-05T10:00:00.000Z",
          },
        ],
      };
    }),
  );

  const created = await repository.createCompany({
    name: "  FleetBid Trading LLC ",
    country: " UAE ",
    registrationNumber: " REG-001 ",
  });

  assert.match(capturedSql, /INSERT INTO "Company"/);
  assert.equal(capturedParams[1], "FleetBid Trading LLC");
  assert.equal(capturedParams[2], "UAE");
  assert.equal(capturedParams[3], "REG-001");
  assert.equal(capturedParams[4], companyStatuses.pending);

  assert.equal(created.id, "company-1");
  assert.equal(created.name, "FleetBid Trading LLC");
  assert.equal(created.country, "UAE");
  assert.equal(created.registrationNumber, "REG-001");
  assert.equal(created.status, companyStatuses.pending);
  assert.ok(created.createdAt instanceof Date);
});

test("addUserToCompany creates membership and defaults to MEMBER", async () => {
  let capturedParams: readonly unknown[] = [];

  const repository = createCompanyRepository(
    createMockTransactionRunner(async (_sql, params) => {
      capturedParams = params;

      return {
        rows: [
          {
            id: "company-user-1",
            userId: "user-1",
            companyId: "company-1",
            role: "MEMBER",
          },
        ],
      };
    }),
  );

  const membership = await repository.addUserToCompany({
    userId: " user-1 ",
    companyId: " company-1 ",
  });

  assert.equal(capturedParams[1], "user-1");
  assert.equal(capturedParams[2], "company-1");
  assert.equal(capturedParams[3], companyUserRoles.member);

  assert.equal(membership.id, "company-user-1");
  assert.equal(membership.userId, "user-1");
  assert.equal(membership.companyId, "company-1");
  assert.equal(membership.role, companyUserRoles.member);
});

test("findCompanyById returns company when found and null for blank id", async () => {
  let queryCalls = 0;

  const repository = createCompanyRepository(
    createMockTransactionRunner(async (_sql, params) => {
      queryCalls += 1;
      assert.equal(params[0], "company-2");

      return {
        rows: [
          {
            id: "company-2",
            name: "FleetBid Autos",
            country: "KSA",
            registrationNumber: "REG-002",
            status: "ACTIVE",
            createdAt: "2026-03-05T11:00:00.000Z",
          },
        ],
      };
    }),
  );

  const found = await repository.findCompanyById(" company-2 ");

  assert.ok(found);
  assert.equal(found?.status, companyStatuses.active);
  assert.equal(queryCalls, 1);

  const blankResult = await repository.findCompanyById("   ");
  assert.equal(blankResult, null);
  assert.equal(queryCalls, 1);
});
