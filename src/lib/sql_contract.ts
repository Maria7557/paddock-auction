export type SqlRow = Record<string, unknown>;

export type SqlQueryResult<T extends SqlRow> = {
  rows: T[];
};

export interface SqlClient {
  query<T extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<SqlQueryResult<T>>;
}

export interface SqlTransactionRunner {
  transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T>;
}

export function toNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Field ${fieldName} must be numeric. Received: ${String(value)}`);
}

export function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}
