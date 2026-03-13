import { cookies } from "next/headers";

export async function withServerCookies(options: RequestInit = {}): Promise<RequestInit> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  if (!cookieHeader) {
    return options;
  }

  return {
    ...options,
    headers: {
      ...Object.fromEntries(new Headers(options.headers).entries()),
      cookie: cookieHeader,
    },
  };
}
