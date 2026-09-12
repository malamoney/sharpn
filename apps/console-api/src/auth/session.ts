/**
 * The signed cookie a browser holds instead of a login this service
 * remembers.
 *
 * There is one shared password and no user identity behind it, so a session
 * names nothing but itself: an id that distinguishes one browser's cookie from
 * another's, and an expiry. Both are carried in the cookie, signed with an
 * HMAC over a secret this process reads once at startup, and verified without
 * looking anything up — which is the whole point. Revoking one session is not
 * a meaningful operation with one shared credential; revoking all of them is
 * changing the password and rotating the secret this file is given, which
 * invalidates every cookie in the house at once.
 *
 * The expiry slides: `requireSession` reissues the cookie with a fresh expiry
 * on every request it lets through, so a browser that keeps asking stays
 * signed in and one that stops is signed out thirty days after its last
 * request, not thirty days after its first.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

/** How long a session lasts since it was last used. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** A session, as the cookie states it and nothing more. */
export interface Session {
  /** Distinguishes one browser's cookie from another's. Not a user. */
  id: string;
  /** Epoch milliseconds. Past this, the cookie verifies as nothing. */
  expiresAt: number;
}

/** A freshly signed cookie, and the session it names. */
export interface SignedSession {
  /** The cookie's value. Never logged: it is a bearer credential. */
  value: string;
  session: Session;
}

/** What a route needs to start, hold, and end a session. */
export interface Sessions {
  /**
   * How long a freshly minted or renewed session lasts, in milliseconds.
   *
   * Read by `http/session.ts`'s cookie `Max-Age` rather than assumed to be
   * `SESSION_DURATION_MS`: `config.ts`'s environment override means the two
   * can differ, and a browser told the wrong one would keep a cookie past
   * when the server has already stopped honouring it, or throw one away
   * while the server still would.
   */
  readonly durationMs: number;
  /** A new session, distinct from every other one this process has minted. */
  mint(): SignedSession;
  /**
   * The session a cookie value names, or `undefined` if the signature does
   * not verify or the session has expired.
   *
   * Signature checked before expiry, and both checked before anything about
   * the payload is trusted — a cookie that fails either is not a session
   * whose id or expiry this process should read.
   */
  verify(value: string): Session | undefined;
  /** The same session, with its expiry slid forward from now. */
  renew(session: Session): SignedSession;
}

/**
 * A cookie signed with `secret`.
 *
 * The clock is a parameter for the reason `meter.ts`'s is: expiry is
 * arithmetic on time passing, and a test that waits thirty days to ask
 * whether a cookie has expired is a test nobody runs. `durationMs` is a
 * parameter for the same reason applied to the deploy rather than the test:
 * `config.ts`'s `SESSION_DURATION_MS` environment override lets an e2e run
 * watch a real, running server's session actually expire, which a black-box
 * test otherwise cannot do — there is no server-side revocation to trigger
 * instead (see this file's own top comment).
 */
export function sessionsSignedWith(
  secret: string,
  now: () => number = Date.now,
  durationMs: number = SESSION_DURATION_MS,
): Sessions {
  function signed(session: Session): SignedSession {
    const payload = `${session.id}.${session.expiresAt}`;
    const value = `${payload}.${sign(secret, payload)}`;
    return { value, session };
  }

  function verified(value: string): Session | undefined {
    const lastDot = value.lastIndexOf(".");
    if (lastDot < 0) {
      return undefined;
    }

    const payload = value.slice(0, lastDot);
    const signature = value.slice(lastDot + 1);
    if (!constantTimeEqual(signature, sign(secret, payload))) {
      return undefined;
    }

    const separator = payload.indexOf(".");
    const id = payload.slice(0, separator);
    const expiresAt = Number(payload.slice(separator + 1));
    if (id === "" || !Number.isFinite(expiresAt)) {
      return undefined;
    }

    return { id, expiresAt };
  }

  return {
    durationMs,

    mint() {
      return signed({
        id: randomBytes(16).toString("hex"),
        expiresAt: now() + durationMs,
      });
    },

    verify(value) {
      const session = verified(value);
      if (session === undefined || session.expiresAt <= now()) {
        return undefined;
      }

      return session;
    },

    renew(session) {
      return signed({ ...session, expiresAt: now() + durationMs });
    },
  };
}

/**
 * The secret a cookie is signed with, read once from the file it lives in.
 *
 * The same reasoning as the Gateway Token's (`gateway/credentials.ts`): a
 * signing secret in an environment variable is a secret in `docker inspect`,
 * a crash dump, and a process listing. Read once at startup, because
 * re-reading it per request would buy nothing but a window where a rotation
 * is half in effect — every cookie signed before it and verified after it
 * would fail for no reason a person watching the house did anything to cause.
 */
export function readSessionSecret(file: string): string {
  const secret = readFileSync(file, "utf8").trim();
  if (secret === "") {
    throw new Error(`the session secret file ${file} is empty`);
  }

  return secret;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Whether two strings are equal, without a comparison whose timing says how
 * far through they matched.
 *
 * `timingSafeEqual` refuses buffers of different lengths outright, which is
 * itself timing-observable — but only by length, never by content, and a
 * signature's length does not depend on the secret.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}
