// Proves, against the running deployment, that a change to a Light reaches a
// browser's event stream — the one thing no health check can say.
//
// Run by scripts/smoke-live-updates.sh, which copies this into the
// console-api container and runs it there. Inside, not outside, for two
// reasons: the Console API is not published to the host (docker-compose.yml),
// and the container holds the session secret, so a session can be minted with
// the Console API's own code rather than a password typed on the Mac.
//
// What it does: open `/api/v1/events` the way a browser would, read one Light,
// flip it through `PATCH /api/v1/lights/:id`, and wait for a `light.changed`
// naming that Light to come back down the stream. Then flip it back. A green
// run means Gateway → Console API → browser is whole; a red one, with the
// PATCH itself succeeding, is docs/runbooks/live-updates-stopped.md.
//
// The two paths it exercises are exactly the two that can disagree. `/readyz`
// answered `subscription: established` throughout the September 2026 outage,
// and every PATCH succeeded, while the event stream carried nothing for 34
// hours — the subscription was open to a Gateway whose own feed from the
// Bridge had died without a FIN (malamoney/hue#38). Only asking for an event
// and not getting one can tell that apart from a quiet house.
//
// One bulb blinks for about a second. LIGHT_ID picks which; the default is
// the first Light listed. WAIT_MS bounds the wait for the event (default 5s).
import {
  readSessionSecret,
  sessionsSignedWith,
} from "/repo/apps/console-api/dist/auth/session.js";
import { SESSION_COOKIE_NAME } from "/repo/apps/console-api/dist/http/session.js";

const BASE = "http://127.0.0.1:3000";
const WAIT_MS = Number(process.env["WAIT_MS"] ?? 5_000);
// `|| undefined`: the shell wrapper passes the variable through whether or
// not it was set, and an empty string means "not chosen", not "a Light with
// no id".
const LIGHT_ID = process.env["LIGHT_ID"] || undefined;

const sessions = sessionsSignedWith(readSessionSecret("/run/secrets/session-secret"));
const cookie = `${SESSION_COOKIE_NAME}=${sessions.mint().value}`;
const headers = { Cookie: cookie, Origin: BASE, "Content-Type": "application/json" };

function say(line) {
  console.log(`[smoke ${new Date().toISOString().slice(11, 23)}] ${line}`);
}

/** Every named frame the stream has delivered so far. */
const frames = [];

async function readStream(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const lines = buffer.slice(0, boundary).split("\n");
      buffer = buffer.slice(boundary + 2);
      const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
      const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
      if (event !== undefined) {
        frames.push({ event, data });
        say(`stream: ${event} ${data ?? ""}`);
      }
    }
  }
  say("stream ended");
}

async function patch(id, on) {
  return fetch(`${BASE}/api/v1/lights/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ on }),
  });
}

const stream = await fetch(`${BASE}/api/v1/events`, { headers: { Cookie: cookie } });
if (!stream.ok) {
  say(`RED: /api/v1/events answered ${stream.status}`);
  process.exit(1);
}
void readStream(stream.body);

const listed = await fetch(`${BASE}/api/v1/lights`, { headers });
if (!listed.ok) {
  say(`RED: /api/v1/lights answered ${listed.status} ${await listed.text()}`);
  process.exit(1);
}
const lights = await listed.json();
const light = LIGHT_ID === undefined ? lights[0] : lights.find((l) => l.id === LIGHT_ID);
if (light === undefined) {
  say(`RED: no Light ${LIGHT_ID ?? "at all"} among ${lights.length} listed`);
  process.exit(1);
}
say(`Light ${light.id} (${light.name}) is ${light.on ? "on" : "off"}`);

// Let the stream's opening `connection` frame land before counting.
await new Promise((resolve) => setTimeout(resolve, 300));
const seen = frames.length;

const started = Date.now();
const changed = await patch(light.id, !light.on);
say(`PATCH -> ${changed.status} ${(await changed.text()).slice(0, 160)}`);

let arrived;
while (Date.now() - started < WAIT_MS) {
  arrived = frames
    .slice(seen)
    .find((f) => f.event === "light.changed" && f.data?.includes(light.id));
  if (arrived) break;
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const restored = await patch(light.id, light.on);
if (!restored.ok) {
  say(`could not restore ${light.name}: PATCH -> ${restored.status}`);
}

if (arrived) {
  say(`GREEN: light.changed for ${light.id} arrived ${Date.now() - started}ms after the PATCH`);
  process.exit(0);
}
say(
  `RED: no light.changed for ${light.id} within ${WAIT_MS}ms` +
    (changed.ok
      ? " — the Bridge took the change and the stream never mentioned it; see docs/runbooks/live-updates-stopped.md"
      : " — and the PATCH itself failed, so this is not the event stream"),
);
process.exit(1);
