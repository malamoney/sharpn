/**
 * Issue #10's layer 3, case 4: an expired session closing an established
 * stream.
 *
 * The session cookie has no server-side revocation (auth/session.ts's own
 * comment: "revoking one session is not a meaningful operation with one
 * shared credential") — the only thing that ever notices a session has
 * expired mid-stream is `http/events.ts`'s heartbeat timer, which re-checks
 * the cookie on every tick and ends the stream rather than holding it open on
 * a session that no longer exists. `docker-compose.e2e.yml` sets
 * `SESSION_DURATION_MS` short specifically so this can be watched happening
 * on a real, running server, rather than waited thirty days for.
 */
import { expect, test } from "@playwright/test";

import { api, login } from "../support/http.js";

test("the event stream closes once its session has expired, rather than staying silently open", async () => {
  // The heartbeat that notices expiry (http/events.ts's
  // HEARTBEAT_INTERVAL_MS, 15s, not overridden here) runs on a timer from
  // when the stream opened, not from when the session was minted — so the
  // wait below is bounded by docker-compose.e2e.yml's SESSION_DURATION_MS
  // plus that whole window, not SESSION_DURATION_MS alone. Longer than the
  // config's default per-test timeout to give it room.
  test.setTimeout(60_000);

  const session = await login();

  const stream = await api(session, "/api/v1/events");
  const reader = stream.body?.getReader();
  if (reader === undefined) {
    throw new Error("GET /api/v1/events answered with no body to read");
  }

  // Deliberately never renewed after this: the point is to watch this exact
  // cookie's own clock run out, not to keep it alive the way api()'s normal
  // renewal would.
  let done = false;
  const deadline = Date.now() + 50_000;
  while (!done && Date.now() < deadline) {
    const result = await reader.read();
    done = result.done;
  }

  expect(done).toBe(true);
});
