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
import {
  loginRateLimit,
  requireSession,
  sessionIdOf,
  sessionRoutes,
  type SessionParts,
} from "./session.js";

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
 * reads is a limit on the Console keeping up with a house. The same set is
 * what the CSRF guard skips: an Origin can be forged and a `GET` cannot be
 * made to do anything a browser navigating there would not do anyway.
 */
const CHANGES_NOTHING = new Set(["GET", "HEAD", "OPTIONS"]);

/** What the edge in front of the routes needs. */
export interface EdgeParts {
  /** Consulted before a Mutation to a Light is read, and never before a read. */
  meter: Meter;
}

/** Everything the app is built out of. */
export interface ConsoleApiParts
  extends EdgeParts, LightRouteParts, HealthRouteParts, SessionParts {}

export function consoleApi(parts: ConsoleApiParts): Express {
  const app = express();

  // Exactly one proxy, which is the Nginx in front of this process. It decides
  // what `request.ip` is, which is read below to meter a login attempt before
  // there is a session to read anything else off. Trusting one hop is only
  // sound because nothing else can reach this process: it is published to a
  // container network and never to the host.
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

  // CSRF's Origin check, for every mutation this service serves — including
  // signing in, which has no cookie yet for `SameSite=Strict` to be strict
  // about. Before the body is read, same as the meters below: a request this
  // rejects should never have its body parsed on its account.
  app.use(csrfGuard);

  // Lights sit behind a session; `/session` is how one is started, and
  // `/healthz`, `/readyz` and `/version` are answered to whoever is running
  // this process, not to a signed-in browser. Mounted before the body is
  // read, like the meter it sits in front of: an unauthenticated request
  // should not have its body parsed on this service's account either.
  app.use("/api/v1/lights", requireSession(parts));
  app.use("/api/v1/lights", meterMutations(parts));
  // Same reasoning, for a login attempt: it has to be counted before Express
  // tries to parse its body, or a body it cannot parse never reaches the
  // route whose job that counting was — and the guess it never counted was
  // free.
  app.use("/api/v1/session", loginRateLimit(parts));

  app.use(express.json({ limit: BODY_LIMIT }));

  app.use(healthRoutes(parts));
  app.use("/api/v1", sessionRoutes(parts));
  app.use("/api/v1", lightRoutes(parts));

  app.use(unservedPath);
  app.use(bodyThatCouldNotBeRead);

  return app;
}

/**
 * The Origin check half of CSRF.
 *
 * `SameSite=Strict` (`http/session.ts`) already keeps the session cookie off
 * a cross-site request in a browser that honours it; this is what covers a
 * login, which carries no cookie to be strict about, and what does not
 * depend on the browser at all. There is no double-submit token: with one
 * shared password and no session store, a token would be one more thing
 * derived from the same cookie it is meant to be independent of.
 *
 * Compared by host alone, not the full origin: the scheme half of `Origin`
 * would have to be read off `request.protocol`, which only reports `https`
 * if Nginx forwards `X-Forwarded-Proto` — a header this service cannot make
 * Nginx send. Guessing the scheme wrong would not let a forged request
 * through, because an attacker's Origin never carries this host at all; it
 * would only lock out every real browser the moment the guess disagreed with
 * how it was actually served. The host is what an attacker's origin cannot
 * forge, and it is also the one part of this a misconfigured proxy cannot
 * get wrong, since it is `request.headers.host` verbatim.
 */
function csrfGuard(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (CHANGES_NOTHING.has(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  const originHost = origin === undefined ? undefined : hostOf(origin);
  const expectedHost = request.headers.host;

  if (originHost === undefined || originHost !== expectedHost) {
    refuseWithoutAsking(response, {
      code: "CSRF_REJECTED",
      detail:
        origin === undefined
          ? "that change carried no Origin header"
          : `that change came from ${origin}, not this service's own host`,
    });
    return;
  }

  next();
}

/** An `Origin` header's host, or `undefined` if it is not a URL at all. */
function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

/** Counts anything that is not a read, and refuses past the minute's worth. */
function meterMutations({ meter }: EdgeParts): RequestHandler {
  return (request, response, next) => {
    if (CHANGES_NOTHING.has(request.method)) {
      next();
      return;
    }

    // `requireSession` is mounted ahead of this on every path that reaches
    // it, so a session id is always here to read. Thrown rather than
    // defaulted: a route reorganisation that broke that ordering would
    // otherwise merge every session's budget into one shared bucket keyed
    // `"unknown"`, silently — no test would fail, and every browser in the
    // house would share one limit. This turns that mistake into a 500 the
    // moment it is made instead.
    const sessionId = sessionIdOf(request);
    if (sessionId === undefined) {
      throw new Error(
        "meterMutations reached a request requireSession did not " +
          "authenticate; check the mount order in app.ts",
      );
    }

    const spend = meter.spend(sessionId);
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
