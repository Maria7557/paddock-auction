type MutationResult = "success" | "rejected" | "failed";

type EntityFieldKey = "auction_id" | "company_id" | "user_id";

type EntityFields = {
  auction_id?: string;
  company_id?: string;
  user_id?: string;
};

export type StructuredMutationLogEntry = {
  correlation_id: string;
  idempotency_key?: string;
  auction_id?: string;
  company_id?: string;
  user_id?: string;
  route: string;
  result: MutationResult;
  error_code?: string;
  duration_ms: number;
};

export type StructuredMutationLogger = Pick<Console, "info" | "warn" | "error">;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CORRELATION_ID_HEADER = "x-correlation-id";
const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const ERROR_CODE_HEADER = "x-error-code";

const entityHeaderCandidates: Record<EntityFieldKey, string[]> = {
  auction_id: ["x-auction-id", "auction-id"],
  company_id: ["x-company-id", "company-id"],
  user_id: ["x-user-id", "user-id"],
};

const entityQueryCandidates: Record<EntityFieldKey, string[]> = {
  auction_id: ["auction_id", "auctionId"],
  company_id: ["company_id", "companyId"],
  user_id: ["user_id", "userId"],
};

const entityBodyCandidates: Record<EntityFieldKey, string[]> = {
  auction_id: ["auction_id", "auctionId"],
  company_id: ["company_id", "companyId"],
  user_id: ["user_id", "userId"],
};

function cleanOptionalValue(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function classifyResult(status: number): MutationResult {
  if (status >= 500) {
    return "failed";
  }

  if (status >= 400) {
    return "rejected";
  }

  return "success";
}

function extractEntityFieldFromHeaders(headers: Headers, key: EntityFieldKey): string | undefined {
  for (const candidate of entityHeaderCandidates[key]) {
    const value = cleanOptionalValue(headers.get(candidate));

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function extractEntityFieldFromQuery(url: URL, key: EntityFieldKey): string | undefined {
  for (const candidate of entityQueryCandidates[key]) {
    const value = cleanOptionalValue(url.searchParams.get(candidate));

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readNestedValue(payload: unknown, candidate: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const directValue = record[candidate];

  if (typeof directValue === "string") {
    return cleanOptionalValue(directValue);
  }

  return undefined;
}

async function extractEntityFieldsFromBody(request: Request): Promise<EntityFields> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const payload = await request.clone().json();
    const entityFields: EntityFields = {};

    for (const key of Object.keys(entityBodyCandidates) as EntityFieldKey[]) {
      for (const candidate of entityBodyCandidates[key]) {
        const value = readNestedValue(payload, candidate);

        if (value !== undefined) {
          entityFields[key] = value;
          break;
        }
      }
    }

    return entityFields;
  } catch {
    return {};
  }
}

function mergeEntityFields(
  queryFields: EntityFields,
  headerFields: EntityFields,
  bodyFields: EntityFields,
): EntityFields {
  return {
    auction_id: queryFields.auction_id ?? headerFields.auction_id ?? bodyFields.auction_id,
    company_id: queryFields.company_id ?? headerFields.company_id ?? bodyFields.company_id,
    user_id: queryFields.user_id ?? headerFields.user_id ?? bodyFields.user_id,
  };
}

function withCorrelationHeader(response: Response, correlationId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(CORRELATION_ID_HEADER, correlationId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function logStructuredEntry(entry: StructuredMutationLogEntry, logger: StructuredMutationLogger): void {
  const payload = JSON.stringify(entry);

  if (entry.result === "failed") {
    logger.error(payload);
    return;
  }

  if (entry.result === "rejected") {
    logger.warn(payload);
    return;
  }

  logger.info(payload);
}

type RouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
) => Promise<Response> | Response;

export function withStructuredMutationLogging<TContext = unknown>(
  handler: RouteHandler<TContext>,
  logger: StructuredMutationLogger = console,
): RouteHandler<TContext> {
  return async (request: Request, context: TContext): Promise<Response> => {
    const method = request.method.toUpperCase();

    if (!MUTATION_METHODS.has(method)) {
      return handler(request, context);
    }

    const startedAtMs = Date.now();
    const url = new URL(request.url);
    const correlationId =
      cleanOptionalValue(request.headers.get(CORRELATION_ID_HEADER)) ?? crypto.randomUUID();
    const idempotencyKey = cleanOptionalValue(request.headers.get(IDEMPOTENCY_KEY_HEADER));

    const queryFields: EntityFields = {
      auction_id: extractEntityFieldFromQuery(url, "auction_id"),
      company_id: extractEntityFieldFromQuery(url, "company_id"),
      user_id: extractEntityFieldFromQuery(url, "user_id"),
    };

    const headerFields: EntityFields = {
      auction_id: extractEntityFieldFromHeaders(request.headers, "auction_id"),
      company_id: extractEntityFieldFromHeaders(request.headers, "company_id"),
      user_id: extractEntityFieldFromHeaders(request.headers, "user_id"),
    };

    const bodyFieldsPromise = extractEntityFieldsFromBody(request);

    try {
      const response = await handler(request, context);
      const bodyFields = await bodyFieldsPromise;
      const mergedFields = mergeEntityFields(queryFields, headerFields, bodyFields);
      const durationMs = Date.now() - startedAtMs;
      const result = classifyResult(response.status);
      const errorCode = cleanOptionalValue(response.headers.get(ERROR_CODE_HEADER));

      logStructuredEntry(
        {
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          auction_id: mergedFields.auction_id,
          company_id: mergedFields.company_id,
          user_id: mergedFields.user_id,
          route: url.pathname,
          result,
          error_code: errorCode,
          duration_ms: durationMs,
        },
        logger,
      );

      return withCorrelationHeader(response, correlationId);
    } catch (error) {
      const bodyFields = await bodyFieldsPromise;
      const mergedFields = mergeEntityFields(queryFields, headerFields, bodyFields);
      const durationMs = Date.now() - startedAtMs;
      const errorCode =
        error instanceof Error && "code" in error
          ? cleanOptionalValue(String((error as { code?: string }).code))
          : "UNHANDLED_EXCEPTION";

      logStructuredEntry(
        {
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          auction_id: mergedFields.auction_id,
          company_id: mergedFields.company_id,
          user_id: mergedFields.user_id,
          route: url.pathname,
          result: "failed",
          error_code: errorCode,
          duration_ms: durationMs,
        },
        logger,
      );

      throw error;
    }
  };
}
