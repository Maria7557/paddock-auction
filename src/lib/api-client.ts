type PrimitiveSearchValue = string | number | boolean | null | undefined;
type SearchValue = PrimitiveSearchValue | PrimitiveSearchValue[];

export type SearchParamsInput =
  | string
  | URLSearchParams
  | Record<string, SearchValue>;

export type ApiUser = {
  id: string;
  email: string;
  role: string;
};

export class ApiError extends Error {
  statusCode: number;
  payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function isAbsoluteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function normalizePath(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return path;
  }

  return `/${path}`;
}

function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");

  if (baseUrl) {
    return baseUrl;
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:4000";
  }

  return "";
}

export function buildApiUrl(path: string): string {
  const normalizedPath = normalizePath(path);

  if (isAbsoluteUrl(normalizedPath)) {
    return normalizedPath;
  }

  if (typeof window !== "undefined") {
    return normalizedPath;
  }

  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
}

function appendSearchParams(path: string, input?: SearchParamsInput): string {
  if (!input) {
    return path;
  }

  if (typeof input === "string") {
    if (!input) {
      return path;
    }

    return input.startsWith("?") ? `${path}${input}` : `${path}?${input}`;
  }

  const params = input instanceof URLSearchParams ? new URLSearchParams(input) : new URLSearchParams();

  if (!(input instanceof URLSearchParams)) {
    for (const [key, rawValue] of Object.entries(input)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];

      for (const value of values) {
        if (value === null || value === undefined || value === "") {
          continue;
        }

        params.append(key, String(value));
      }
    }
  }

  const queryString = params.toString();

  if (!queryString) {
    return path;
  }

  return `${path}?${queryString}`;
}

function shouldApplyJsonContentType(body: BodyInit | null | undefined): boolean {
  if (!body) {
    return true;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return false;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }

  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return false;
  }

  return true;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");

  if (!text) {
    return null;
  }

  return text;
}

function resolveErrorMessage(payload: unknown, response: Response): string {
  if (payload && typeof payload === "object") {
    if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }

    if ("error" in payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }

    if ("error_code" in payload && typeof payload.error_code === "string" && payload.error_code.trim()) {
      return payload.error_code;
    }
  }

  if (response.statusText.trim()) {
    return response.statusText;
  }

  return `Request failed with status ${response.status}`;
}

export function getApiErrorPayload<T>(error: unknown): T | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  return error.payload as T;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  if (!headers.has("content-type") && shouldApplyJsonContentType(options.body)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    credentials: "include",
    headers,
  });
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(resolveErrorMessage(payload, response), response.status, payload);
  }

  return payload as T;
}

async function getRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: options?.method ?? "GET",
  });
}

async function postJson<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    body: body === undefined ? options?.body : JSON.stringify(body),
  });
}

async function patchJson<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "PATCH",
    body: body === undefined ? options?.body : JSON.stringify(body),
  });
}

async function deleteRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "DELETE",
  });
}

async function postForm<T>(path: string, body: FormData, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    body,
  });
}

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<{ user: ApiUser }> =>
      postJson<{ user: ApiUser }>("/api/auth/login", { email, password }),
    register: async <T = unknown>(payload: Record<string, unknown>): Promise<T> =>
      postJson<T>("/api/auth/register", payload),
    me: async <T = { user: ApiUser }>(options?: RequestInit): Promise<T> =>
      getRequest<T>("/api/auth/me", options),
    logout: async (): Promise<void> => postJson<void>("/api/auth/logout"),
  },
  health: {
    get: async <T = { status: string; timestamp: string }>(): Promise<T> =>
      getRequest<T>("/api/health"),
  },
  auctions: {
    list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
      getRequest<T>(appendSearchParams("/api/auctions", query), options),
    get: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
      getRequest<T>(`/api/auctions/${id}`, options),
    liveState: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
      getRequest<T>(`/api/auctions/${id}/live`, options),
    live: async (id: string, options?: RequestInit): Promise<{ currentPrice?: number; endsAt?: string; state?: string }> => {
      const payload = await getRequest<{
        auction?: {
          currentPrice?: number;
          endsAt?: string;
          state?: string;
        };
      }>(`/api/auctions/${id}`, options);

      return {
        currentPrice: payload.auction?.currentPrice,
        endsAt: payload.auction?.endsAt,
        state: payload.auction?.state,
      };
    },
    bids: async <T = unknown>(id: string, query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
      getRequest<T>(appendSearchParams(`/api/auctions/${id}/bids`, query), options),
    buyNow: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
      postJson<T>(`/api/auctions/${id}/buy-now`, undefined, options),
  },
  ui: {
    auctions: {
      get: async (
        id: string,
        options?: RequestInit,
      ): Promise<{ current_bid_aed: number; ends_at: string | null }> => {
        const payload = await getRequest<{
          auction?: {
            currentPrice?: number;
            endsAt?: string | null;
          };
        }>(`/api/auctions/${id}`, options);

        return {
          current_bid_aed: Number(payload.auction?.currentPrice ?? 0),
          ends_at: payload.auction?.endsAt ?? null,
        };
      },
      bids: async (
        id: string,
        query?: SearchParamsInput,
        options?: RequestInit,
      ): Promise<{
        bids: Array<{
          id: string;
          bidder_alias: string;
          amount_aed: number;
          placed_at: string;
          sequence_no: number;
          is_mine: boolean;
        }>;
      }> => {
        const payload = await getRequest<{
          bids?: Array<{
            id: string;
            amount: number;
            createdAt: string;
            sequenceNo: number;
            companyId?: string;
            userId?: string;
          }>;
        }>(appendSearchParams(`/api/auctions/${id}/bids`, query), options);

        return {
          bids: (payload.bids ?? []).map((bid) => ({
            id: bid.id,
            bidder_alias: bid.companyId ? `Company ${bid.companyId.slice(-4).toUpperCase()}` : "Bidder",
            amount_aed: Number(bid.amount ?? 0),
            placed_at: bid.createdAt,
            sequence_no: Number(bid.sequenceNo ?? 0),
            is_mine: false,
          })),
        };
      },
    },
  },
  bids: {
    place: async <T = unknown>(auctionId: string, amount: number, idempotencyKey: string, options?: RequestInit): Promise<T> =>
      postJson<T>("/api/bids", { auctionId, amount, idempotencyKey }, options),
  },
  seller: {
    dashboard: async <T = unknown>(options?: RequestInit): Promise<T> =>
      getRequest<T>("/api/seller/dashboard", options),
    vehicles: {
      list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/seller/vehicles", query), options),
      create: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>("/api/seller/vehicles", payload, options),
      get: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        getRequest<T>(`/api/seller/vehicles/${id}`, options),
      update: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        patchJson<T>(`/api/seller/vehicles/${id}`, payload, options),
      remove: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        deleteRequest<T>(`/api/seller/vehicles/${id}`, options),
    },
    auctions: {
      list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/seller/auctions", query), options),
      create: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>("/api/seller/auctions", payload, options),
      get: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        getRequest<T>(`/api/seller/auctions/${id}`, options),
      update: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        patchJson<T>(`/api/seller/auctions/${id}`, payload, options),
    },
    company: {
      get: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/seller/company", options),
      update: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        patchJson<T>("/api/seller/company", payload, options),
    },
    notifications: {
      get: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/seller/notifications-preferences", options),
      update: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        patchJson<T>("/api/seller/notifications-preferences", payload, options),
    },
    documents: {
      list: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/seller/documents", options),
      upload: async <T = unknown>(payload: FormData, options?: RequestInit): Promise<T> =>
        postForm<T>("/api/seller/documents", payload, options),
    },
    team: {
      list: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/seller/team", options),
      invite: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>("/api/seller/team/invite", payload, options),
      updateRole: async <T = unknown>(userId: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        patchJson<T>(`/api/seller/team/${userId}/role`, payload, options),
      remove: async <T = unknown>(userId: string, options?: RequestInit): Promise<T> =>
        deleteRequest<T>(`/api/seller/team/${userId}`, options),
    },
  },
  admin: {
    vehicles: {
      list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/admin/vehicles", query), options),
      approve: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/vehicles/${id}/approve`, undefined, options),
      reject: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/vehicles/${id}/reject`, undefined, options),
      setMarketPrice: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/vehicles/${id}/set-market-price`, payload, options),
      assignEvent: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/vehicles/${id}/assign-event`, payload, options),
    },
    events: {
      list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/admin/events", query), options),
      create: async <T = unknown>(payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>("/api/admin/events", payload, options),
      get: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        getRequest<T>(`/api/admin/events/${id}`, options),
      remove: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        deleteRequest<T>(`/api/admin/events/${id}`, options),
      reorder: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/events/${id}/reorder`, payload, options),
      removeVehicle: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/events/${id}/remove-vehicle`, payload, options),
      addVehicle: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/events/${id}/add-vehicle`, payload, options),
    },
    companies: {
      list: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/admin/companies", query), options),
      pending: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/admin/companies/pending", options),
      approve: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/companies/${id}/approve`, undefined, options),
      reject: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/companies/${id}/reject`, undefined, options),
    },
    users: {
      pending: async <T = unknown>(query?: SearchParamsInput, options?: RequestInit): Promise<T> =>
        getRequest<T>(appendSearchParams("/api/admin/users/pending", query), options),
      approveKyc: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/users/${id}/approve-kyc`, undefined, options),
      block: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/users/${id}/block`, payload, options),
      unblock: async <T = unknown>(id: string, payload: Record<string, unknown>, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/users/${id}/unblock`, payload, options),
    },
    buyers: {
      approveDeposit: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/buyers/${id}/approve-deposit`, undefined, options),
      rejectDeposit: async <T = unknown>(id: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/admin/buyers/${id}/reject-deposit`, undefined, options),
    },
  },
  buyer: {
    wishlist: {
      list: async <T = unknown>(options?: RequestInit): Promise<T> =>
        getRequest<T>("/api/buyer/wishlist", options),
      add: async <T = unknown>(auctionId: string, options?: RequestInit): Promise<T> =>
        postJson<T>(`/api/buyer/wishlist/${auctionId}`, undefined, options),
      remove: async <T = unknown>(auctionId: string, options?: RequestInit): Promise<T> =>
        deleteRequest<T>(`/api/buyer/wishlist/${auctionId}`, options),
    },
  },
  wallet: {
    get: async <T = unknown>(options?: RequestInit): Promise<T> =>
      getRequest<T>("/api/wallet", options),
    deposit: async <T = unknown>(amount: number, idempotencyKey: string, options?: RequestInit): Promise<T> =>
      postJson<T>("/api/wallet/deposit", { amount, idempotencyKey }, options),
    withdraw: async <T = unknown>(amount: number, options?: RequestInit): Promise<T> =>
      postJson<T>("/api/wallet/withdraw", { amount }, options),
  },
  payments: {
    invoice: {
      get: async <T = unknown>(invoiceId: string, options?: RequestInit): Promise<T> =>
        getRequest<T>(`/api/payments/invoices/${invoiceId}`, options),
      createIntent: async <T = unknown>(invoiceId: string, idempotencyKey: string, options?: RequestInit): Promise<T> =>
        postJson<T>(
          `/api/payments/invoices/${invoiceId}/intent`,
          undefined,
          {
            ...options,
            headers: {
              ...Object.fromEntries(new Headers(options?.headers).entries()),
              "idempotency-key": idempotencyKey,
            },
          },
        ),
    },
  },
} as const;
