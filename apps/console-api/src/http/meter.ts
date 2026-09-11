/**
 * How many Mutations one session may send in a minute.
 *
 * Reads are deliberately not metered. A read costs the Bridge one request and
 * nothing else, and metering them would put a limit between a browser and the
 * Invalidations it is obliged to react to — every one of which costs a read
 * (ADR 0002). A Mutation is the one that changes a house, so it is the one
 * with a ceiling on it.
 *
 * The ceiling is a parameter and the window is not, because both limits the
 * edge policy names are per minute: sixty Mutations for a session, and five
 * login attempts for an address once there is anywhere to attempt one.
 *
 * The window is a log of when each Mutation was sent rather than a counter
 * that resets on the minute. A counter is cheaper and wrong in the way that
 * matters: it lets a session send a full minute's worth just before the reset
 * and a second full minute's worth just after, which is twice the limit in the
 * two seconds that straddle it.
 */

/** The ceiling on Mutations, per session, per window. */
export const MUTATIONS_PER_MINUTE = 60;

/** How far back the meter looks. */
export const WINDOW_MS = 60_000;

/**
 * What one Mutation's attempt to spend came to.
 *
 * A union rather than a flag beside a number, so that there is no seconds to
 * wait on the arm where waiting is not the answer: `Retry-After` is only ever
 * read off a refusal, and a zero on the other arm is a value a route could
 * send by mistake.
 */
export type Spend =
  | { allowed: true }
  | {
      allowed: false;
      /**
       * How long to wait, in seconds, and never zero: it is sent as
       * `Retry-After`, and a `Retry-After: 0` on a refusal tells a browser to
       * do immediately the thing it was just refused for.
       */
      retryAfterSeconds: number;
    };

/** What the routes ask before sending a Command. */
export interface Meter {
  /** Counts one against a key, and says whether it may go. */
  spend(key: string): Spend;
  /**
   * The sessions the meter is still holding a count for.
   *
   * Exposed so that "it forgets" is something a test can assert rather than
   * something this comment claims. Nothing in a route reads it.
   */
  remembering(): string[];
}

/**
 * A meter that allows `limit` of something per window, per key.
 *
 * The clock is a parameter because the only interesting questions about a
 * window are about time passing, and a test that has to wait a minute to ask
 * one is a test nobody runs.
 */
export function meterAtMost(
  limit: number,
  now: () => number = Date.now,
): Meter {
  /** When each session's recent Mutations were sent, oldest first. */
  const sent = new Map<string, number[]>();

  return {
    spend(key) {
      const at = now();
      const since = at - WINDOW_MS;

      // Every session, not just this one. A session that stopped sending has
      // nothing left inside the window, so the sweep that keeps this map
      // honest is the same sweep that keeps it small — and it bounds the map
      // by who was active in the last minute rather than by who has ever
      // been seen.
      for (const [other, times] of sent) {
        const recent = times.filter((time) => time > since);
        if (recent.length === 0) {
          sent.delete(other);
        } else {
          sent.set(other, recent);
        }
      }

      const recent = sent.get(key) ?? [];
      if (recent.length < limit) {
        sent.set(key, [...recent, at]);

        return { allowed: true };
      }

      // The oldest Mutation in the window is the one whose leaving makes room,
      // so its age is what there is to wait for — rounded up, and never to
      // zero.
      const oldest = recent[0] ?? at;

      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldest + WINDOW_MS - at) / 1000),
        ),
      };
    },

    remembering() {
      return [...sent.keys()];
    },
  };
}
