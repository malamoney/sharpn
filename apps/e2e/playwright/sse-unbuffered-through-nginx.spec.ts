/**
 * Issue #10's layer 3, case 2: SSE arriving unbuffered through Nginx.
 *
 * `apps/console/nginx.conf`'s `/api/v1/events` location sets
 * `proxy_buffering off` specifically so an event reaches a browser as the
 * Console API writes it, not once Nginx's buffer fills or the connection
 * ends. This asserts on that directly: an event has to arrive within a few
 * seconds of the change that caused it, over the real proxy — a build that
 * lost `proxy_buffering off` would still pass every other spec here (the
 * connection is still alive, still correct) and only be caught by timing.
 */
import { expect, test } from "@playwright/test";

import { api, login, nextLightEvent } from "../support/http.js";

const SHELF = "bbbbbbbb-0000-4000-8000-000000000002";

test("an event reaches the client promptly, not batched behind Nginx's proxy buffer", async () => {
  const session = await login();

  const stream = await api(session, "/api/v1/events");
  const reader = stream.body?.getReader();
  if (reader === undefined) {
    throw new Error("GET /api/v1/events answered with no body to read");
  }

  try {
    const seen = nextLightEvent(reader);

    const before = (await (await api(session, `/api/v1/lights/${SHELF}`)).json()) as {
      on: boolean;
    };
    const changedAt = Date.now();
    await api(session, `/api/v1/lights/${SHELF}`, {
      method: "PATCH",
      body: JSON.stringify({ on: !before.on }),
    });

    const event = await Promise.race([
      seen,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("no event within 5s — Nginx may be buffering")), 5_000),
      ),
    ]);
    const arrivedAfterMs = Date.now() - changedAt;

    expect(event).toMatchObject({ event: "light.changed", data: { id: SHELF } });
    // events.ts flushes its per-browser buffer every FLUSH_INTERVAL_MS (50ms);
    // a second is generous headroom over that for one hop through Nginx, and
    // nowhere near what a buffered proxy would actually make this wait.
    expect(arrivedAfterMs).toBeLessThan(1_000);
  } finally {
    await reader.cancel();
  }
});
