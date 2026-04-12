const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const AUTH_TOKEN_KEY = "dailyplan_token";
export const AUTH_USER_KEY = "dailyplan_user";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function handleUnauthorized(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.location.replace("/login");
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  isForm = false,
): Promise<T> {
  const headers: HeadersInit = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!isForm) {
    headers["Content-Type"] = "application/json";
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body:
      body == null
        ? undefined
        : isForm
          ? (body as URLSearchParams).toString()
          : JSON.stringify(body),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, "Unauthorized");
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) {
        message = data.detail;
      }
    } catch {
      // ignore body parse error
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export function apiFormPost<T>(
  path: string,
  formData: URLSearchParams,
): Promise<T> {
  return request<T>("POST", path, formData, true);
}
