import type { Prisma } from "@prisma/client";

import prisma from "./prisma";
import type { SqlClient, SqlQueryResult, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";

type PrismaQueryable = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

function createSqlClient(queryable: PrismaQueryable): SqlClient {
  return {
    async query<T extends SqlRow = SqlRow>(sql: string, params: readonly unknown[] = []): Promise<SqlQueryResult<T>> {
      const rows = await queryable.$queryRawUnsafe<T[]>(sql, ...params);
      return { rows };
    },
  };
}

export const prismaSqlTransactionRunner: SqlTransactionRunner = {
  async transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (transactionClient: Prisma.TransactionClient) => {
      return handler(createSqlClient(transactionClient));
    });
  },
};
