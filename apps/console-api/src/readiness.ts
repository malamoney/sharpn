/**
 * What `/readyz` is allowed to assert, and the one subscription that keeps it
 * true.
 *
 * Two facts, and deliberately not a third. A Bridge that cannot be reached is
 * a 503 on a route; it is not a reason to take this process out of service,
 * and asserting it here would have an orchestrator restarting a Console API
 * because somebody unplugged a hub.
 *
 * The Gateway's own `grpc.health.v1.Health` cannot answer this either. It
 * reports `SERVING` unconditionally from startup and flips only on graceful
 * shutdown, so an unpaired Gateway with no Bridge at all reports healthy —
 * which makes it a fine liveness probe for the Gateway and no evidence
 * whatsoever about this process.
 */
import type { Gateway, Subscription } from "./gateway/index.js";

/** The two facts `/readyz` reports. */
export interface Readiness {
  /**
   * Whether the one channel to the Gateway is connected at this moment.
   *
   * This is the half that knows whether there is a Gateway. A `Subscribe` is
   * made locally and succeeds whatever is on the other end, so the fact below
   * cannot tell an established subscription from a call into nothing; the
   * channel's connectivity can, and the two are reported together for exactly
   * that reason.
   */
  channelConnected(): boolean;
  /** Whether a `Subscribe` is open and has not ended. */
  subscribed(): boolean;
}

/** A readiness that is being kept up to date, until it is stopped. */
export interface Watch extends Readiness {
  /** Stops watching, and ends the subscription it was holding. */
  stop(): void;
}

/**
 * How long after a subscription ends before another is opened.
 *
 * A flat wait, and knowingly the simplest thing that is not a hot loop: this
 * subscription exists to give `/readyz` something true to say, and the one
 * that carries events to browsers — with bounded exponential backoff and
 * jitter, and a Gap to account for — is the event fan-out's, which replaces
 * this.
 */
export const REOPEN_AFTER_MS = 1_000;

/**
 * Holds one subscription open, and reports what it and the channel are doing.
 *
 * The Notices are dropped. Nothing in this tier has anywhere to put an
 * Invalidation yet, and holding a subscription for the sole fact that it is
 * held is still worth doing: a stream that the Gateway ends is the difference
 * between a process that can serve events and one that has a working channel
 * and nothing listening on it.
 */
export function watchTheGateway(
  gateway: Gateway,
  reopenAfterMs: number = REOPEN_AFTER_MS,
): Watch {
  let open = false;
  let stopped = false;
  let listening: Subscription | undefined;
  let reopening: NodeJS.Timeout | undefined;

  const start = () => {
    // Set before the call rather than after it, because a subscription to a
    // Gateway that is not there can end inside `subscribe` — and assigning
    // `true` after that has happened would leave this claiming a stream that
    // is already over.
    open = true;
    listening = gateway.subscribe({
      onNotice: () => undefined,
      onEnded: () => {
        open = false;
        if (stopped) {
          return;
        }

        // Unreferenced, so that a process with nothing else to do can still
        // exit: this timer is housekeeping, not work anybody is waiting for.
        reopening = setTimeout(start, reopenAfterMs);
        reopening.unref();
      },
    });
  };

  start();

  return {
    channelConnected: () => gateway.isChannelReady(),
    subscribed: () => open,
    stop() {
      stopped = true;
      clearTimeout(reopening);
      listening?.cancel();
      // Cancelling ends the stream, but the Gateway's agreement arrives on a
      // later turn, and a probe answered in between should not be told there
      // is a subscription that is being torn down.
      open = false;
    },
  };
}
