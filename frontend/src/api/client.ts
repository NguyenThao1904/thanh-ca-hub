import type { MessageKey, TranslateVars } from "@/lib/i18n/config";

/** An error from the API. The message is a translation key, shown in the member's language. */
export type ActionError = {
  message: MessageKey;
  params?: TranslateVars;
  /** Per-field messages (translation keys), shown next to the inputs. */
  fieldErrors?: Record<string, MessageKey>;
  /** Optional link, e.g. to the song that already uses a location. */
  href?: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public error: ActionError,
  ) {
    super(`API error ${status}: ${error.message}`);
  }
}

/** Requests that change data carry this header; the server refuses them otherwise (CSRF protection). */
export const CSRF_HEADER = { "X-Requested-With": "thanhca" };

const sessionExpiredListeners = new Set<() => void>();

/** Called when the server says the session has ended (signed out elsewhere, deactivated, expired). */
export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

export function sessionExpired() {
  for (const listener of sessionExpiredListeners) listener();
}

type RequestOptions = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") Object.assign(headers, CSRF_HEADER);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, { message: "errors.network" });
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error: ActionError = data?.error?.message ? data.error : { message: "errors.unknown" };
    if (response.status === 401 && path !== "/auth/login") sessionExpired();
    throw new ApiError(response.status, error);
  }
  return data as T;
}

/** The error to show for anything thrown by a request. */
export function errorOf(error: unknown): ActionError {
  return error instanceof ApiError ? error.error : { message: "errors.network" };
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

export function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
