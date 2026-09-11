/**
 * The one gRPC subscription this process makes to the Gateway, fanned out to
 * however many browsers are listening.
 *
 * One `Subscribe`, opened once and reopened on a bounded, jittered backoff
 * whenever it ends — never one per browser, for the same reason `adapter.ts`
 * opens one channel rather than one per request. `server.ts` holds the one
 * `Fanout` a process makes; `http/events.ts` is what turns what it delivers
 * into Server-Sent Events, one browser at a time.
 *
 * What a Notice means *to a browser* — whether a Gap is forwarded as an
 * Invalidation, how a `light.changed` id gets buffered — is not this file's
 * problem; `http/events.ts` answers that, once per browser. A
 * `subscriber_behind` Gap is the one exception: it is a fact about this
 * process's own subscription having fallen behind the Gateway, true once
 * regardless of how many browsers are listening, so it is logged here —
 * once — rather than once per listener at the tier above.
 */
import type { Gateway, Notice, Subscription } from "../gateway/index.js";
import type { Readiness } from "../readiness.js";
import { DEFAULT_BACKOFF, delays, type Backoff } from "./backoff.js";

/** What a browser's SSE connection registers to be told. */
export interface FanoutListener {
  /** A Light's copy may be stale, or events may have been missed. */
  onNotice(notice: Notice): void;
}

/**
 * The one subscription, shared.
 *
 * Extends `Readiness` rather than restating its two methods: a `Fanout` is
 * what `/readyz` and `/api/v1/events` both read their view of the one
 * subscription from, and `server.ts` hands the same object to each under a
 * different name. The `extends` is what says so, rather than leaving it to
 * be noticed from the two call sites agreeing by coincidence.
 */
export interface Fanout extends Readiness {
  /**
   * Adds a listener; call the function returned to remove it.
   *
   * Removing one never ends the subscription — it is shared by every
   * listener at once, not owned by any of them.
   */
  listen(listener: FanoutListener): () => void;
  /** Ends the subscription. No listener is told anything more after this. */
  stop(): void;
}

/**
 * How long a stream has to stay open, once accepted, before it is trusted
 * enough to reset the backoff schedule.
 *
 * A Gateway that accepts a `Subscribe` call and then immediately errors —
 * unhealthy but reachable, rather than absent — would otherwise reset the
 * schedule to `backoff.baseMs` on every single attempt: `onOpened` fires on
 * the stream's initial metadata, which a server commonly sends before any
 * handler logic runs, so metadata alone is not proof the subscription is
 * actually good for anything. A stream that survives this long past it is.
 */
export const CONFIRMED_OPEN_AFTER_MS = 1_000;

/**
 * Opens the one `Subscribe` this process makes, and keeps it open.
 *
 * A subscription that ends is reopened after a wait drawn from `backoff`,
 * doubling on every consecutive loss and resetting once a fresh one has
 * stayed open for `CONFIRMED_OPEN_AFTER_MS` — so a blip is retried quickly
 * and an outage, or a Gateway that is merely broken rather than absent, is
 * not retried into the ground.
 */
export function fanoutEvents(
  gateway: Gateway,
  backoff: Backoff = DEFAULT_BACKOFF,
): Fanout {
  const listeners = new Set<FanoutListener>();
  let open = false;
  let stopped = false;
  let listening: Subscription | undefined;
  let reopening: NodeJS.Timeout | undefined;
  let confirming: NodeJS.Timeout | undefined;
  let nextDelay = delays(backoff);

  const start = () => {
    // Set before the call rather than after it: a subscription to a Gateway
    // that is not there can end inside `subscribe`, and assigning `true`
    // after that has happened would leave this claiming a stream already
    // over (see `readiness.test.ts`'s equivalent, before this replaced it).
    open = true;
    listening = gateway.subscribe({
      onNotice(notice) {
        // A fact about this subscription — this process fell behind the one
        // stream it holds — true once no matter how many browsers are
        // listening, so it is logged once here rather than once per browser
        // at the tier above. Not `reconnected`: that Gap is the Bridge's,
        // announced on every one of the Gateway's own reconnects, and ADR
        // 0002 already accounts for it via the Resync that follows.
        if (notice.kind === "gap" && notice.cause === "subscriber_behind") {
          console.error(
            "the Console API's subscription to the Gateway fell behind " +
              `and missed events (missed=${notice.missed})`,
          );
        }

        for (const listener of listeners) {
          listener.onNotice(notice);
        }
      },
      onOpened() {
        clearTimeout(confirming);
        confirming = setTimeout(() => {
          nextDelay = delays(backoff);
        }, CONFIRMED_OPEN_AFTER_MS);
        confirming.unref();
      },
      onEnded() {
        open = false;
        clearTimeout(confirming);
        if (stopped) {
          return;
        }

        // Unreferenced, so a process with nothing else to do can still exit:
        // this timer is housekeeping, not work anybody is waiting for.
        reopening = setTimeout(start, nextDelay());
        reopening.unref();
      },
    });
  };

  start();

  return {
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    channelConnected: () => gateway.isChannelReady(),
    subscribed: () => open,
    stop() {
      stopped = true;
      clearTimeout(reopening);
      clearTimeout(confirming);
      listening?.cancel();
      // Cancelling ends the stream, but the Gateway's agreement arrives on a
      // later turn, and a probe answered in between should not be told there
      // is a subscription that is being torn down.
      open = false;
    },
  };
}
