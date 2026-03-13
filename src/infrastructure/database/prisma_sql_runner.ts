import type { SqlClient, SqlQueryResult, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";

const unsupportedClient: SqlClient = {
  async query<T extends SqlRow = SqlRow>(_sql: string, _params: readonly unknown[] = []): Promise<SqlQueryResult<T>> {
    throw new Error("SQL access has been moved out of the Next.js frontend.");
  },
};

export const prismaSqlTransactionRunner: SqlTransactionRunner = {
  async transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T> {
    return handler(unsupportedClient);
  },
};
