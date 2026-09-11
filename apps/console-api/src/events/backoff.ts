/**
 * How long to wait before opening the shared subscription again, and again
 * after that.
 *
 * Mirrors the Gateway's own `hue_grpc.events.fanout.Backoff`, one level up
 * the stack: that one governs the Gateway reconnecting to the Bridge, this
 * one governs the Console API reconnecting to the Gateway. Both are unbounded
 * in attempts — a Gateway that is unreachable all night is still the Gateway
 * — and bounded in delay, so a process that has been retrying all night
 * notices the Gateway within `ceilingMs` of it coming back.
 */
export interface Backoff {
  /** The first wait. Doubles for every one after, up to `ceilingMs`. */
  baseMs: number;
  /** Where the doubling stops. */
  ceilingMs: number;
  /**
   * How a wait is drawn from its ceiling. `fullJitter` by default, for the
   * reason the Gateway's own draw is: several Console API instances that lost
   * the same Gateway must not retry it in step.
   */
  jitter: (ceiling: number) => number;
}

/** A wait drawn uniformly between zero and `ceiling`. */
export function fullJitter(ceiling: number): number {
  return Math.random() * ceiling;
}

export const DEFAULT_BACKOFF: Backoff = {
  baseMs: 500,
  ceilingMs: 30_000,
  jitter: fullJitter,
};

/**
 * Successive waits, forever, each one drawn from a ceiling that doubles
 * until it reaches `backoff.ceilingMs`.
 *
 * A closure rather than a generator: the caller asks for one delay at a
 * time, whenever a subscription ends, and never wants to iterate the rest.
 */
export function delays(backoff: Backoff = DEFAULT_BACKOFF): () => number {
  if (backoff.baseMs < 0 || backoff.ceilingMs < backoff.baseMs) {
    throw new Error(
      `a backoff runs from base to ceiling: ${backoff.baseMs} to ${backoff.ceilingMs}`,
    );
  }

  let ceiling = backoff.baseMs;

  return () => {
    const delay = backoff.jitter(ceiling);
    ceiling = Math.min(backoff.ceilingMs, ceiling * 2);
    return delay;
  };
}
