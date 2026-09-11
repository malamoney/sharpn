/**
 * Everything a browser can reach, assembled.
 *
 * The app is built from parts rather than from a configuration file so that
 * every one of them can be stood in for: the routes are tested against a
 * Gateway that answers from a table, which is the only way to ask what a
 * `RESOURCE_EXHAUSTED` becomes without arranging for a Bridge to be busy.
 * `server.ts` is where the real ones are made.
 *
 * The order the middleware is mounted in is load-bearing and is the subject of
 * most of the comments below.
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import { mintCorrelationId } from "../gateway/index.js";
import { refuseWithoutAsking } from "./answer.js";
import { healthRoutes, type HealthRouteParts } from "./health.js";
import { lightRoutes, type LightRouteParts } from "./lights.js";
import type { Meter } from "./meter.js";

/**
 * How much of a request body is read before it is refused.
 *
 * A Command is a handful of numbers, so anything approaching this is either a
 * mistake or somebody seeing what happens. The limit is what makes it cheap to
 * find out: the body is refused by its declared length or as it arrives, and
 * is never parsed.
 */
export const BODY_LIMIT = "8kb";

/**
 * The methods that are not metered, which is to say the ones that change
 * nothing.
 *
 * Reads are deliberately unmetered. Every Invalidation carries an id and
 * nothing else, so every one of them costs a read (ADR 0002) — a limit on
 * reads is a limit on the Console keeping up with a house.
 */
const CHANGES_NOTHING = new Set(["GET", "HEAD", "OPTIONS"]);

/** What the edge in front of the routes needs. */
export interface EdgeParts {
  /** Consulted before a Mutation is read, and never before a read. */
  meter: Meter;
  /**
   * What a Mutation is counted against.
   *
   * A seam, because the thing it should be — the signed cookie's session — is
   * not built yet. Until it is, a request is counted against where it came
   * from: the browser's address when exactly one proxy is in front of this
   * process, and the proxy's own otherwise, which shares one budget between
   * every browser rather than handing each an unlimited one.
   */
  sessionOf(request: Request): string;
}

/** Everything the app is built out of. */
export interface ConsoleApiParts
  extends EdgeParts, LightRouteParts, HealthRouteParts {}

export function consoleApi(parts: ConsoleApiParts): Express {
  const app = express();

  // Exactly one proxy, which is the Nginx in front of this process. It decides
  // what `request.ip` is, and `request.ip` is what a Mutation is counted
  // against until there is a session to count it against. Trusting one hop is
  // only sound because nothing else can reach this process: it is published to
  // a container network and never to the host.
  app.set("trust proxy", 1);
  // The signature a browser can read off a response, which says nothing about
  // what is answering. It is off by default in Express 5 but not in 4, and
  // asking for it explicitly is cheaper than remembering which.
  app.disable("x-powered-by");
  // An ETag on a Light is a promise this service cannot keep. Nothing here is
  // cached, the Bridge is the only thing that knows what is true, and a
  // browser answered `304` for a Light it is reading *because* it was told the
  // Light changed would be told nothing changed.
  app.disable("etag");

  // Before the body is read, not after. A session sending malformed or
  // oversized bodies as fast as it can is exactly what the meter is for, and
  // one that only counted the requests that parsed would be a limit on being
  // well behaved.
  app.use(meterMutations(parts));
  app.use(express.json({ limit: BODY_LIMIT }));

  app.use(healthRoutes(parts));
  app.use("/api/v1", lightRoutes(parts));

  app.use(unservedPath);
  app.use(bodyThatCouldNotBeRead);

  return app;
}

/** Counts anything that is not a read, and refuses past the minute's worth. */
function meterMutations({ meter, sessionOf }: EdgeParts): RequestHandler {
  return (request, response, next) => {
    if (CHANGES_NOTHING.has(request.method)) {
      next();
      return;
    }

    const spend = meter.spend(sessionOf(request));
    if (spend.allowed) {
      next();
      return;
    }

    refuseWithoutAsking(response, {
      code: "TOO_MANY_REQUESTS",
      retryAfterSeconds: spend.retryAfterSeconds,
    });
  };
}

/**
 * A path this service does not serve.
 *
 * Answered in the same envelope as everything else, because a browser that has
 * to parse two shapes of failure will get one of them wrong. The code is
 * `INVALID_REQUEST` and the status is therefore the 400 the catalogue gives it
 * rather than the 404 a path usually earns: every code is sent with one
 * status, always, and a 404 here would be the first exception to that — which
 * is worth less than the invariant it costs. Nginx routes `/api/` here
 * separately from the Console's own files, so this is never what a mistyped
 * page looks like; it is what a mistyped request looks like.
 */
function unservedPath(request: Request, response: Response): void {
  refuseWithoutAsking(response, {
    code: "INVALID_REQUEST",
    detail: `nothing here serves ${request.method} ${request.path}`,
  });
}

/**
 * A body the edge would not read: too large, or not JSON.
 *
 * These are the only failures Express raises on this service's behalf, and
 * they are raised before any route sees the request. Everything a route does
 * answers with a result rather than throwing, so anything else arriving here
 * is a fault in this process: it is logged with an id to find it by, and
 * handed back to Express, which answers a bare 500. Dressing one of those as a
 * code from the catalogue would put a Console API bug in front of a person
 * wearing the Gateway's name, and every code in that table describes something
 * else.
 */
function bodyThatCouldNotBeRead(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const refused = error as {
    type?: unknown;
    status?: unknown;
    message?: string;
  };
  const raisedByTheBodyReader =
    typeof refused.type === "string" &&
    typeof refused.status === "number" &&
    refused.status < 500;

  if (!raisedByTheBodyReader) {
    const correlationId = mintCorrelationId();
    console.error(
      `the Console API failed in a way it does not have a code for ` +
        `(correlationId=${correlationId})`,
      error,
    );
    // The one thing that can still be honoured: the response carries an id,
    // so the bare 500 a person sees is one that can be looked up here.
    response.setHeader("x-correlation-id", correlationId);
    next(error);
    return;
  }

  refuseWithoutAsking(response, {
    code: "INVALID_REQUEST",
    detail:
      refused.type === "entity.too.large"
        ? `the body is larger than the ${BODY_LIMIT} this service reads; a ` +
          "Command is a handful of keys"
        : (refused.message ?? "the body could not be read"),
  });
}
