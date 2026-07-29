export interface AuthState {
  user: {
    id: string;
    loginId: string;
    email: string;
    role: string;
  };
  csrfToken: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

function endpoint(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  return `${base}${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (options.csrfToken) headers.set("x-csrf-token", options.csrfToken);

  const response = await fetch(endpoint(path), {
    ...options,
    headers,
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
    requestId?: string;
  } | null;
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : (payload?.message ?? "요청을 처리하지 못했습니다.");
    throw new ApiError(message, response.status, payload?.requestId);
  }
  return payload as T;
}
