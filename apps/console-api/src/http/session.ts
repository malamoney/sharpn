/**
 * Signing in, staying in, and signing out — the whole of "who is this" for a
 * service with one shared password and no user identity behind it.
 *
 * `requireSession` is the gate every other browser-facing route sits behind;
 * the two routes here are deliberately the ones in front of it. `app.ts`
 * mounts `loginRateLimit` on `/api/v1/session` as its own gate, ahead of the
 * routes and ahead of body parsing, because a login attempt is metered by
 * address rather than by session — it has no session yet, which is the
 * ceiling `meter.ts` already names.
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";

import type { PasswordCheck } from "../auth/password.js";
import { SESSION_DURATION_MS, type Sessions } from "../auth/session.js";
import { readLoginCommand } from "../contract/index.js";
import { mintCorrelationId } from "../gateway/index.js";
import { CORRELATION_ID_HEADER, refuseWithoutAsking } from "./answer.js";
import type { Meter } from "./meter.js";

/** The name the session cookie rides under. */
export const SESSION_COOKIE_NAME = "sharpn_session";

/** What the session routes and the gate in front of the rest need. */
export interface SessionParts {
  sessions: Sessions;
  passwords: PasswordCheck;
  /** Counts a login attempt against the address it came from. */
  loginMeter: Meter;
}

/**
 * The session id `requireSession` verified for this request, keyed off the
 * request itself rather than a property on it.
 *
 * A `WeakMap` rather than `(request as SomeType).sessionId`: nothing else on
 * `Request` needs widening for one field only the meter reads, and a map
 * that is never written for a request `requireSession` did not see is the
 * correct absence rather than a cast away from it.
 */
const verifiedSessionIds = new WeakMap<Request, string>();

/** The session id a request was authenticated under, if it was. */
export function sessionIdOf(request: Request): string | undefined {
  return verifiedSessionIds.get(request);
}

/**
 * The session cookie's raw value, read off a request's `Cookie` header.
 *
 * `requireSession` reads this once, to verify. `http/events.ts` reads it
 * again, on a timer, because a Server-Sent Events connection makes no second
 * request for a sliding expiry to renew on — session expiry is otherwise
 * invisible to a stream that is already open.
 */
export function sessionCookieOf(request: Request): string | undefined {
  return cookieNamed(SESSION_COOKIE_NAME, request.headers.cookie);
}

/**
 * The gate `app.ts` mounts on `/api/v1/session` ahead of `express.json()`.
 *
 * A login attempt has to be counted before its body is read, not inside the
 * route: a route only runs once Express has parsed the body, and a body it
 * cannot parse never reaches one — it goes straight to the error handler at
 * the end of the chain instead. Mounted here rather than left inline for the
 * same reason the Mutation meter is (`app.ts`'s `meterMutations`): a login
 * guessing passwords as fast as it can is exactly what this ceiling is for,
 * and one that only counted the guesses that parsed would be a limit on
 * being well behaved.
 */
export function loginRateLimit({
  loginMeter,
}: Pick<SessionParts, "loginMeter">): RequestHandler {
  return (request, response, next) => {
    if (request.method !== "POST") {
      // Signing out asks nothing of a password, and there is no session
      // store to guess anything out of.
      next();
      return;
    }

    const spend = loginMeter.spend(request.ip ?? "unknown");
    if (!spend.allowed) {
      refuseWithoutAsking(response, {
        code: "TOO_MANY_REQUESTS",
        retryAfterSeconds: spend.retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

export function sessionRoutes({ sessions, passwords }: SessionParts): Router {
  const routes = Router();

  routes.post("/session", async (request, response) => {
    const reading = readLoginCommand(request.body);
    if (!reading.ok) {
      refuseWithoutAsking(response, {
        code: "INVALID_REQUEST",
        detail: reading.detail,
      });
      return;
    }

    const matches = await passwords.matches(reading.command.password);
    if (!matches) {
      // Never "wrong password": there is one password and no account to
      // have mistyped the name of, so the honest refusal is the same one an
      // expired cookie gets.
      refuseWithoutAsking(response, {
        code: "NOT_AUTHENTICATED",
        detail: "that password does not match",
      });
      return;
    }

    const { value } = sessions.mint();
    setSessionCookie(response, value);
    response.setHeader(CORRELATION_ID_HEADER, mintCorrelationId());
    response.status(204).end();
  });

  routes.delete("/session", (_request, response) => {
    clearSessionCookie(response);
    response.setHeader(CORRELATION_ID_HEADER, mintCorrelationId());
    response.status(204).end();
  });

  return routes;
}

/**
 * The gate every route past this point sits behind.
 *
 * A request with no cookie, or one that does not verify, is refused before it
 * reaches a route — a route never sees a request this did not authenticate.
 * One that does verify has its cookie reissued with a fresh expiry, which is
 * the sliding window: the browser that keeps asking stays signed in, and one
 * that stops is signed out thirty days after its *last* request rather than
 * its first.
 */
export function requireSession({ sessions }: Pick<SessionParts, "sessions">): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const cookie = sessionCookieOf(request);
    const session = cookie === undefined ? undefined : sessions.verify(cookie);

    if (session === undefined) {
      refuseWithoutAsking(response, {
        code: "NOT_AUTHENTICATED",
        detail: "no session, or one that has expired",
      });
      return;
    }

    verifiedSessionIds.set(request, session.id);

    const renewed = sessions.renew(session);
    setSessionCookie(response, renewed.value);
    next();
  };
}

/**
 * `HttpOnly` so a script on the page cannot read it, `Secure` because it
 * never leaves a TLS hop, and `SameSite=Strict` so it is never attached to a
 * request this page did not make — the whole of the CSRF story that is not
 * the Origin check in `app.ts`.
 *
 * `Max-Age` is always the same number of seconds: every mint and every renew
 * sets `expiresAt` to `now() + SESSION_DURATION_MS`, so there is no wall
 * clock to read here at all, and nothing to skew if this process's ever did.
 */
function setSessionCookie(response: Response, value: string): void {
  const maxAgeSeconds = SESSION_DURATION_MS / 1000;

  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(response: Response): void {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

/** The value one cookie carries, read out of the raw `Cookie` header. */
function cookieNamed(name: string, header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) {
      continue;
    }

    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }

  return undefined;
}
