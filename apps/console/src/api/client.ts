/**
 * The one place a request leaves the Console.
 *
 * Every route answers in one envelope (`http/answer.ts`), so there is one
 * place to turn that back into either a value or an `ApiError` — and one
 * place a session that has expired is noticed, since every route but
 * `/session` itself sits behind `requireSession`.
 */
import { ApiError } from "./apiError.js";
import type { ErrorEnvelope } from "./types.js";

const BASE = "/api/v1";

/** Told about a `401`, wherever a browser should go read about that. */
export type UnauthenticatedListener = () => void;

const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/** Registers a listener for "the Console API says this browser is signed out"; call what is returned to remove it. */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => {
    unauthenticatedListeners.delete(listener);
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * One request, decided down to a value or an `ApiError`.
 *
 * A `fetch` that never got an answer at all — the Console API unreachable —
 * rejects with the `TypeError` `fetch` itself throws, left as-is rather than
 * wrapped: `apiError.ts`'s `classifyOutage` is what tells that apart from a
 * refusal the Console API did answer with.
 */
async function request<Value>(
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<Value> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      for (const listener of unauthenticatedListeners) {
        listener();
      }
    }

    throw await apiErrorFrom(response);
  }

  if (response.status === 204) {
    return undefined as Value;
  }

  return (await response.json()) as Value;
}

/**
 * The `ApiError` a failed response describes.
 *
 * Every route this service serves answers a failure in `ErrorEnvelope`'s
 * shape (`http/answer.ts`). A response that does not parse as one is a fault
 * this Console did not anticipate — a proxy's own error page, say — and is
 * reported as `GATEWAY_ERROR` with the response's own status line as detail,
 * rather than thrown as something a caller has no code to switch on.
 */
async function apiErrorFrom(response: Response): Promise<ApiError> {
  const correlationId = response.headers.get("x-correlation-id") ?? "unknown";
  const retryAfter = response.headers.get("retry-after");

  try {
    const envelope = (await response.json()) as ErrorEnvelope;
    return new ApiError({
      ...envelope.error,
      retryAfterSeconds: retryAfter === null ? undefined : Number(retryAfter),
    });
  } catch {
    return new ApiError({
      code: "GATEWAY_ERROR",
      message: "The Console API answered in a shape this Console did not expect.",
      detail: `HTTP ${response.status} ${response.statusText}`,
      correlationId,
    });
  }
}

export function get<Value>(path: string): Promise<Value> {
  return request<Value>(path);
}

export function post<Value>(path: string, body?: unknown): Promise<Value> {
  return request<Value>(path, { method: "POST", body });
}

export function patch<Value>(path: string, body: unknown): Promise<Value> {
  return request<Value>(path, { method: "PATCH", body });
}

export function del<Value>(path: string): Promise<Value> {
  return request<Value>(path, { method: "DELETE" });
}
