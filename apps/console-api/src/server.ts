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

import { settingsFrom } from "./config.js";
import { connectToGateway } from "./gateway/index.js";
import { consoleApi } from "./http/app.js";
import { meterMutations } from "./http/meter.js";
import { watchTheGateway } from "./readiness.js";

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
const readiness = watchTheGateway(gateway);

const server = createServer(
  consoleApi({
    gateway,
    readiness,
    version: settings.version,
    meter: meterMutations(),
    // Where the request came from, until there is a session to count against
    // instead. `request.ip` is the browser's address because exactly one proxy
    // is trusted in front of this process, and the proxy's own if that ever
    // stops being true — which shares one budget between every browser rather
    // than handing each an unlimited one.
    sessionOf: (request) => request.ip ?? "unknown",
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
 * In that order, so that a request already in flight is answered rather than
 * losing its channel halfway through. The subscription is stopped first of
 * all: it reopens itself when it ends, and a shutdown is the one ending that
 * must not be reconnected through.
 */
function stop(signal: string): void {
  console.log(`${signal} received; the Console API is shutting down`);
  readiness.stop();
  server.close(() => {
    gateway.close();
  });
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
