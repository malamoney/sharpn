/**
 * `GET /api/v1/events`: every Invalidation a browser is owed, as Server-Sent
 * Events, over the one subscription `events/fanout.ts` holds.
 *
 * Three event names reach a browser. `light.changed`, `light.added` and
 * `light.removed` each carry an id and nothing else — the Gateway offers the
 * changed properties too, typed, and ADR 0002 is why they are not forwarded.
 * `connection` carries `{ gateway, resyncing }`, and a `:` comment is written
 * every `HEARTBEAT_INTERVAL_MS` so a proxy between here and a browser does
 * not decide the connection is idle and close it.
 *
 * Per-browser buffering, not per-notice delivery: light ids arriving between
 * flushes are collapsed into a `Map` keyed by id, so two Invalidations for
 * the same Light — which ADR 0002 says are the same Invalidation — cost one
 * frame rather than two, and a burst costs one flush rather than one write
 * per event. `connection` rides the same timer rather than being written the
 * instant it changes: a status a browser learns fifty milliseconds late is
 * not a status a person notices, and one timer per browser is simpler than
 * two racing each other.
 *
 * Every open stream registers itself with the `StreamRegistry` `server.ts`
 * holds, because nothing about an open connection ends it on its own and
 * `http.Server.close()` waits for exactly that during a graceful shutdown.
 */
import { Router, type Request, type Response } from "express";

import type { Sessions } from "../auth/index.js";
import type { Fanout } from "../events/fanout.js";
import type { Invalidation } from "../gateway/index.js";
import { sessionCookieOf } from "./session.js";

/** How often the per-browser buffer of dirty light ids is flushed. */
export const FLUSH_INTERVAL_MS = 50;

/**
 * How often a heartbeat comment is written, and how often this connection's
 * session is checked for having expired since it opened.
 *
 * One timer for both on purpose rather than two: nothing here exposes either
 * cadence to an operator to tune independently, so a second timer would be
 * complexity bought for a coupling nobody can yet observe.
 */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** What the events route needs from the process around it. */
export interface EventRouteParts {
  fanout: Fanout;
  sessions: Sessions;
  streams: StreamRegistry;
}

/**
 * Every open Server-Sent Events connection this process is holding.
 *
 * `http.Server.close()` waits for every open connection to end before its
 * callback runs, and nothing about an open stream ends on its own — a
 * browser that never disconnects and a session that has not yet expired
 * holds one forever. `server.ts`'s shutdown reads this to end them all
 * itself, rather than waiting on a graceful close that a stream this
 * long-lived would otherwise never contribute to.
 */
export interface StreamRegistry {
  /**
   * Registers one open stream's own `end`; call what is returned once it has
   * ended on its own, so a stream that disconnects is not held onto.
   */
  track(end: () => void): () => void;
  /** Ends every stream still open. */
  closeAll(): void;
}

export function openStreams(): StreamRegistry {
  const ends = new Set<() => void>();

  return {
    track(end) {
      ends.add(end);
      return () => {
        ends.delete(end);
      };
    },
    closeAll() {
      // Copied first: each `end()` below removes itself via the function
      // `track` returned, and mutating the Set while iterating it directly
      // would skip whatever shifted into the spot just vacated.
      for (const end of [...ends]) {
        end();
      }
    },
  };
}

/** The two timers a test may want to run faster than real time. */
export interface EventRouteTiming {
  flushIntervalMs: number;
  heartbeatIntervalMs: number;
}

const DEFAULT_TIMING: EventRouteTiming = {
  flushIntervalMs: FLUSH_INTERVAL_MS,
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
};

/** What a `connection` event says. */
interface ConnectionStatus {
  gateway: "connected" | "reconnecting";
  resyncing: boolean;
}

export function eventRoutes(
  parts: EventRouteParts,
  timing: EventRouteTiming = DEFAULT_TIMING,
): Router {
  const routes = Router();

  routes.get("/events", (request, response) => {
    openStream(request, response, parts, timing);
  });

  return routes;
}

function openStream(
  request: Request,
  response: Response,
  { fanout, sessions, streams }: EventRouteParts,
  { flushIntervalMs, heartbeatIntervalMs }: EventRouteTiming,
): void {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  // A browser that resets its connection between the heartbeat's read of
  // this socket and the next `write` leaves that write with nowhere to go.
  // Without this, the error `write` raises has no listener and crashes the
  // process — taking down every other browser's stream, not just this one's.
  response.on("error", () => end());

  // Dirty light ids since the last flush, each with the last Invalidation's
  // own kind: two for the same id are the same Invalidation, so the second
  // simply overwrites the first rather than queueing beside it.
  const dirty = new Map<string, Invalidation["change"]>();
  // Set for exactly one flush after a Gap of either cause, so a browser sees
  // one true-then-false pulse rather than a status that never returns to
  // false, or that is missed because it changed and changed back inside one
  // interval.
  let resyncing = false;
  let lastSent: ConnectionStatus | undefined;

  const send = (event: string, data: unknown): void => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const flush = (): void => {
    for (const [id, change] of dirty) {
      send(`light.${change}`, { id });
    }
    dirty.clear();

    const status: ConnectionStatus = {
      gateway: fanout.subscribed() ? "connected" : "reconnecting",
      resyncing,
    };
    if (
      lastSent === undefined ||
      lastSent.gateway !== status.gateway ||
      lastSent.resyncing !== status.resyncing
    ) {
      send("connection", status);
      lastSent = status;
    }
    resyncing = false;
  };

  flush();
  const flushTimer = setInterval(flush, flushIntervalMs);
  flushTimer.unref();

  const heartbeat = setInterval(() => {
    // A stream this long-lived outlives the sliding renewal every other
    // request gets from `requireSession` — nothing about an open connection
    // asks for a fresh cookie — so this is what notices the session it
    // opened under has since expired (#5) and ends the stream rather than
    // holding it open on a session that no longer exists.
    const cookie = sessionCookieOf(request);
    if (cookie === undefined || sessions.verify(cookie) === undefined) {
      end();
      return;
    }

    response.write(":\n\n");
  }, heartbeatIntervalMs);
  heartbeat.unref();

  const unlisten = fanout.listen({
    onNotice(notice) {
      if (notice.kind === "invalidation") {
        // The subscription is filtered to Lights already; a Resource of any
        // other type reaching here would be a Gateway bug, not a Light this
        // Console API has anything to tell a browser about.
        if (notice.resource.rtype !== "light") {
          return;
        }

        dirty.set(notice.resource.rid, notice.change);
        return;
      }

      // A Gap of either cause, not an Invalidation — never a `light.*`
      // event, only a pulse of `resyncing` picked up on the next flush.
      //
      // `reconnected`: the Gateway follows every one with a Resync whose
      // synthesised changes arrive as ordinary Invalidations, which are what
      // actually reach a browser here. Refetching on the Gap itself would
      // duplicate work already in flight (ADR 0002).
      //
      // `subscriber_behind`, or a cause a future Gateway invents: nothing
      // resyncs this one, and `events/fanout.ts` has already logged it as
      // the bug it is — once, there, rather than once per browser here.
      resyncing = true;
    },
  });

  let ended = false;
  let untrack = () => undefined as void;
  const end = (): void => {
    // `close` fires once the exchange is over by any means, which includes
    // this same function having just ended it via the heartbeat's expiry
    // check, or `server.ts` ending every open stream on shutdown — a second
    // run would unlisten and end an already-ended stream.
    if (ended) {
      return;
    }

    ended = true;
    clearInterval(flushTimer);
    clearInterval(heartbeat);
    unlisten();
    untrack();
    response.end();
  };

  untrack = streams.track(end);
  request.on("close", end);
}
