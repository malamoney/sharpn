/**
 * A minimal HTTP client for the e2e stack (docker-compose.e2e.yml), shared by
 * the layer-2 Vitest suite (gateway/protocol.e2e.test.ts) and the layer-3
 * specs that need a genuinely open SSE stream — Playwright's own request
 * context only exposes a response body once the response has finished, which
 * is no use for a connection meant to stay open until something ends it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The e2e stack's certificates are self-signed and untrusted by design
// (scripts/e2e-secrets.sh, ADR 0004's shape) — this module is the one place
// in this repository with no pinned certificate to verify against instead,
// because proving that pinning is exactly what
// gateway/adapter.test.ts's in-process fake Gateway already does.
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const BASE_URL = process.env["E2E_BASE_URL"] ?? "https://localhost";
export const PASSWORD = readFileSync(
  join(REPO_ROOT, ".e2e", "secrets", "password"),
  "utf8",
).trim();

export interface Session {
  cookie: string;
}

export async function login(): Promise<Session> {
  const response = await fetch(`${BASE_URL}/api/v1/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  const [setCookie] = response.headers.getSetCookie();
  if (setCookie === undefined) {
    throw new Error("login answered with no Set-Cookie");
  }
  return { cookie: setCookie.split(";", 1)[0]! };
}

async function once(session: Session, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Origin: BASE_URL,
      Cookie: session.cookie,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
  });

  // `requireSession` slides the expiry forward on every request it lets
  // through (auth/session.ts) — a browser picks that up automatically via its
  // cookie jar, and this stand-in has to do the same or a session here would
  // expire after SESSION_DURATION_MS regardless of how recently it was used.
  const [renewed] = response.headers.getSetCookie();
  if (renewed !== undefined) {
    session.cookie = renewed.split(";", 1)[0]!;
  }

  return response;
}

/**
 * A request under `session`, re-authenticating and retrying once on a
 * NOT_AUTHENTICATED.
 *
 * `docker-compose.e2e.yml` sets `SESSION_DURATION_MS` short, for
 * expired-session-closes-stream.spec.ts — and the sliding expiry only renews
 * a cookie that is still valid, so any orchestration gap wider than that
 * duration (waiting on a container healthcheck touches no HTTP endpoint at
 * all) leaves nothing to renew. Callers that are deliberately exercising
 * expiry call `login()` directly instead of going through this.
 */
export async function api(session: Session, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await once(session, path, init);
  if (response.status !== 401) {
    return response;
  }

  const fresh = await login();
  session.cookie = fresh.cookie;
  return once(session, path, init);
}

/** The next `light.*` event on an open `/api/v1/events` stream. */
export async function nextLightEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ event: string; data: unknown }> {
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      throw new Error("the event stream ended before a light.* event arrived");
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const lines = frame.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (eventLine === undefined || dataLine === undefined) {
        // A heartbeat comment, or a frame this reader doesn't care about.
        continue;
      }

      const event = eventLine.slice("event: ".length);
      if (event.startsWith("light.")) {
        return { event, data: JSON.parse(dataLine.slice("data: ".length)) as unknown };
      }
    }
  }
}
