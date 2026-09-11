/**
 * Everything a browser can reach, assembled.
 *
 * The app is built from parts rather than from a configuration file so that
 * every one of them can be stood in for: the routes are tested against a
 * Gateway that answers from a table, which is the only way to ask what a
 * `RESOURCE_EXHAUSTED` becomes without arranging for a Bridge to be busy.
 * `server.ts` is where the real ones are made.
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { mintCorrelationId } from "../gateway/index.js";
import type { Readiness } from "../readiness.js";
import type { Version } from "../version.js";
import { refuse } from "./answer.js";
import { healthRoutes, type HealthRouteParts } from "./health.js";
import { lightRoutes, type LightRouteParts } from "./lights.js";

/**
 * How much of a request body is read before it is refused.
 *
 * A Command is a handful of numbers, so anything approaching this is either a
 * mistake or somebody seeing what happens. The limit is what makes it cheap to
 * find out: the body is refused by its declared length or as it arrives, and
 * is never parsed.
 */
export const BODY_LIMIT = "8kb";

/** Everything the app is built out of. */
export interface ConsoleApiParts extends LightRouteParts, HealthRouteParts {}

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

  app.use(express.json({ limit: BODY_LIMIT }));

  app.use(healthRoutes(parts));
  app.use("/api/v1", lightRoutes(parts));

  app.use(unservedPath);
  app.use(bodyThatCouldNotBeRead);

  return app;
}

/**
 * A path this service does not serve.
 *
 * Answered in the same envelope as everything else, because a browser that
 * has to parse two shapes of failure will get one of them wrong. The code is
 * `INVALID_REQUEST` and the status is therefore the 400 the catalogue gives
 * it rather than the 404 a path usually earns: every code is sent with one
 * status, always, and a 404 here would be the first exception to that — worth
 * less than the invariant it would cost. Nginx routes `/api/` here separately
 * from the Console's own files, so this is never what a mistyped page looks
 * like; it is what a mistyped request looks like.
 */
function unservedPath(request: Request, response: Response): void {
  refuse(response, {
    code: "INVALID_REQUEST",
    correlationId: mintCorrelationId(),
    detail: `nothing here serves ${request.method} ${request.path}`,
  });
}

/**
 * A body the edge would not read: too large, or not JSON.
 *
 * These are the only failures Express raises on this service's behalf, and
 * they are raised before any route sees the request. Everything a route does
 * answers with a result rather than throwing, so anything else arriving here
 * is a fault in this process — it is logged and handed back to Express, which
 * answers a bare 500. Dressing it as one of the catalogue's codes would put a
 * Console API bug in a browser wearing the Gateway's name.
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
    next(error);
    return;
  }

  refuse(response, {
    code: "INVALID_REQUEST",
    correlationId: mintCorrelationId(),
    detail:
      refused.type === "entity.too.large"
        ? `the body is larger than the ${BODY_LIMIT} this service reads; a ` +
          "Command is a handful of keys"
        : (refused.message ?? "the body could not be read"),
  });
}
