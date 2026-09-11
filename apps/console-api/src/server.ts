/**
 * The process: one channel to the Gateway, one subscription held open, and an
 * HTTP server in front of both.
 *
 * Nothing here is decided; everything is assembled. The settings come from the
 * environment, the Gateway from the settings, and the app from the Gateway —
 * which is why `app.ts` can be driven by a test with a Gateway that answers
 * from a table, and why this file has nothing in it worth testing.
 */
import { createServer } from "node:http";

import {
  passwordCheckFrom,
  readSessionSecret,
  sessionsSignedWith,
} from "./auth/index.js";
import { settingsFrom } from "./config.js";
import { fanoutEvents } from "./events/fanout.js";
import { connectToGateway } from "./gateway/index.js";
import { consoleApi } from "./http/app.js";
import { openStreams } from "./http/events.js";
import {
  LOGIN_ATTEMPTS_PER_MINUTE,
  meterAtMost,
  MUTATIONS_PER_MINUTE,
} from "./http/meter.js";

/**
 * Every address in the container, and deliberately not loopback.
 *
 * Loopback is not shared between containers: a process bound to `127.0.0.1`
 * starts perfectly and Nginx gets connection-refused from the next container
 * along, which looks like a proxy misconfiguration and is not one. This is the
 * single most common way the compose arrangement fails.
 */
const EVERY_ADDRESS = "0.0.0.0";

const settings = settingsFrom(process.env);
const gateway = connectToGateway(settings.gateway);
// The one `Subscribe` this process makes. `/readyz` reads it for whether a
// subscription is held; `/api/v1/events` reads it for what arrives on it —
// the same one, not two.
const fanout = fanoutEvents(gateway);
// Every browser's open Server-Sent Events connection, so shutdown can end
// them itself rather than waiting on a graceful close none of them would
// otherwise contribute to.
const streams = openStreams();

const server = createServer(
  consoleApi({
    gateway,
    readiness: fanout,
    fanout,
    streams,
    version: settings.version,
    meter: meterAtMost(MUTATIONS_PER_MINUTE),
    sessions: sessionsSignedWith(readSessionSecret(settings.auth.sessionSecretFile)),
    passwords: passwordCheckFrom(settings.auth.passwordHashFile),
    loginMeter: meterAtMost(LOGIN_ATTEMPTS_PER_MINUTE),
  }),
);

server.listen(settings.port, EVERY_ADDRESS, () => {
  console.log(
    `the Console API is listening on ${EVERY_ADDRESS}:${settings.port}, ` +
      `with the Gateway at ${settings.gateway.target}`,
  );
});

/**
 * Shutting down: stop listening, then let go of the Gateway.
 *
 * The subscription is stopped first of all: it reopens itself when it ends,
 * and a shutdown is the one ending that must not be reconnected through.
 * Every open event stream is ended next, and deliberately not left to
 * `server.close()`'s own grace: that only waits for connections to end on
 * their own, and nothing about an open Server-Sent Events connection ever
 * does — a browser that is not actively disconnecting holds one until its
 * session expires, which is thirty days, not a deploy's grace period.
 */
function stop(signal: string): void {
  console.log(`${signal} received; the Console API is shutting down`);
  fanout.stop();
  streams.closeAll();
  server.close(() => {
    gateway.close();
  });
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
