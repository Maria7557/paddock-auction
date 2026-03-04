import type { PGlite } from "@electric-sql/pglite";

import type { SqlClient, SqlQueryResult, SqlRow, SqlTransactionRunner } from "../../../src/lib/sql_contract";

export function createPgliteTransactionRunner(db: PGlite): SqlTransactionRunner {
  let queue: Promise<void> = Promise.resolve();

  return {
    async transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        await db.exec("BEGIN");

        try {
          const txClient: SqlClient = {
            async query<T extends SqlRow = SqlRow>(
              sql: string,
              params: readonly unknown[] = [],
            ): Promise<SqlQueryResult<T>> {
              const result = await db.query(sql, params as unknown[]);
              return {
                rows: result.rows as T[],
              };
            },
          };

          const value = await handler(txClient);
          await db.exec("COMMIT");
          return value;
        } catch (error) {
          await db.exec("ROLLBACK");
          throw error;
        }
      });

      queue = run.then(
        () => undefined,
        () => undefined,
      );

      return run;
    },
  };
}
