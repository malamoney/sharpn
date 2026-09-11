/**
 * The one subscription, against a Gateway whose stream the test drives.
 *
 * Timing is scripted rather than real: a Gateway stand-in hands back the
 * `Subscriber` it was given and lets the test decide when it opens, delivers
 * a Notice, or ends — the same shape `readiness.test.ts` used for the watch
 * this file replaces.
 */
import { describe, expect, it, vi } from "vitest";

import type { Gateway, Notice, Subscriber } from "../gateway/index.js";
import { CONFIRMED_OPEN_AFTER_MS, fanoutEvents, type FanoutListener } from "./fanout.js";

/** A Gateway that does nothing but hand out subscriptions and remember them. */
function aGateway() {
  const opened: Subscriber[] = [];
  const cancelled: number[] = [];

  const gateway: Gateway = {
    listLights: vi.fn(),
    getLight: vi.fn(),
    updateLight: vi.fn(),
    isChannelReady: () => true,
    close: vi.fn(),
    subscribe(subscriber) {
      const which = opened.push(subscriber) - 1;

      return {
        cancel: () => {
          cancelled.push(which);
        },
      };
    },
  };

  return { gateway, opened, cancelled };
}

/** The end of the stream, as this process asking to stop produces one. */
const CLEANLY = { ok: true, correlationId: "an-id", value: undefined } as const;

/** Long enough for a reopen scheduled at zero to have happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function aListener(): FanoutListener & { notices: Notice[] } {
  const notices: Notice[] = [];
  return {
    notices,
    onNotice: (notice) => notices.push(notice),
  };
}

const A_GAP: Notice = { kind: "gap", cause: "reconnected", missed: 0 };

describe("a fanout that has just started", () => {
  it("has asked for a subscription and says it has one", async () => {
    const { gateway, opened } = aGateway();

    const fanout = fanoutEvents(gateway, {
      baseMs: 0,
      ceilingMs: 0,
      jitter: () => 0,
    });

    expect(opened).toHaveLength(1);
    expect(fanout.subscribed()).toBe(true);

    fanout.stop();
    await settle();
  });
});

describe("what arrives on the subscription", () => {
  it("reaches every listener, not just the first", async () => {
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway);
    const a = aListener();
    const b = aListener();
    fanout.listen(a);
    fanout.listen(b);

    opened[0]?.onNotice(A_GAP);

    expect(a.notices).toEqual([A_GAP]);
    expect(b.notices).toEqual([A_GAP]);

    fanout.stop();
    await settle();
  });

  it("stops reaching a listener once it is removed", async () => {
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway);
    const a = aListener();
    const stopListening = fanout.listen(a);

    stopListening();
    opened[0]?.onNotice(A_GAP);

    expect(a.notices).toEqual([]);

    fanout.stop();
    await settle();
  });
});

describe("a subscription that has ended", () => {
  it("is reported lost, and another is opened", async () => {
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway, {
      baseMs: 0,
      ceilingMs: 0,
      jitter: () => 0,
    });

    opened[0]?.onEnded(CLEANLY);

    expect(fanout.subscribed()).toBe(false);

    await settle();

    expect(opened).toHaveLength(2);
    expect(fanout.subscribed()).toBe(true);

    fanout.stop();
    await settle();
  });

  it("is lost even when it ended inside the call that opened it", () => {
    // A Gateway that is not there is not a call that fails: the Subscribe
    // succeeds locally and the stream ends. When that happens fast enough to
    // land before `subscribe` has returned, the fanout has to have noticed.
    const { gateway } = aGateway();

    const fanout = fanoutEvents(
      {
        ...gateway,
        subscribe(subscriber) {
          subscriber.onEnded(CLEANLY);

          return { cancel: () => undefined };
        },
      },
      { baseMs: 0, ceilingMs: 0, jitter: () => 0 },
    );

    expect(fanout.subscribed()).toBe(false);
    fanout.stop();
  });

  it("still reaches a listener registered after the reopen", async () => {
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway, {
      baseMs: 0,
      ceilingMs: 0,
      jitter: () => 0,
    });

    opened[0]?.onEnded(CLEANLY);
    await settle();

    const a = aListener();
    fanout.listen(a);
    opened[1]?.onNotice(A_GAP);

    expect(a.notices).toEqual([A_GAP]);

    fanout.stop();
    await settle();
  });
});

describe("reconnecting after a loss", () => {
  it("waits on the schedule the backoff gives it", async () => {
    const { gateway, opened } = aGateway();
    const draws = [11, 22];
    const fanout = fanoutEvents(gateway, {
      baseMs: 1,
      ceilingMs: 1000,
      jitter: () => draws.shift() ?? 0,
    });

    vi.useFakeTimers();
    try {
      opened[0]?.onEnded(CLEANLY);

      await vi.advanceTimersByTimeAsync(10);
      expect(opened).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(2);

      opened[1]?.onEnded(CLEANLY);

      await vi.advanceTimersByTimeAsync(21);
      expect(opened).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(3);
    } finally {
      fanout.stop();
      vi.useRealTimers();
    }
  });

  it("starts the schedule over once a subscription has stayed open long enough to trust", async () => {
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway, {
      baseMs: 1,
      ceilingMs: 1000,
      // The jitter always returns the ceiling it was drawn from, so the wait
      // itself is exactly what the schedule says: 1ms unless it has doubled.
      jitter: (ceiling) => ceiling,
    });

    vi.useFakeTimers();
    try {
      // Lost before ever being accepted: the wait doubles, 1ms then 2ms.
      opened[0]?.onEnded(CLEANLY);
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(2);

      // This one is accepted and stays open past the confirmation window
      // before it is lost, so the wait after it is drawn from the base
      // again rather than continuing to double.
      opened[1]?.onOpened?.();
      await vi.advanceTimersByTimeAsync(CONFIRMED_OPEN_AFTER_MS);
      opened[1]?.onEnded(CLEANLY);
      await vi.advanceTimersByTimeAsync(1);

      expect(opened).toHaveLength(3);
    } finally {
      fanout.stop();
      vi.useRealTimers();
    }
  });

  it("does not trust a subscription that failed right after being accepted", async () => {
    // Accepting a call and then immediately erroring is a Gateway that is
    // reachable but broken, not one that is merely blipping. A schedule that
    // reset on `onOpened` alone would retry a Gateway like that every
    // `baseMs`, forever, rather than backing off.
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway, {
      baseMs: 1,
      ceilingMs: 1000,
      jitter: (ceiling) => ceiling,
    });

    vi.useFakeTimers();
    try {
      opened[0]?.onOpened?.();
      opened[0]?.onEnded(CLEANLY); // well inside the confirmation window
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(2); // waited 1ms, the base

      opened[1]?.onOpened?.();
      opened[1]?.onEnded(CLEANLY); // inside the window again
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(2); // 2ms was not up yet

      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toHaveLength(3); // doubled to 2ms, not reset to 1ms
    } finally {
      fanout.stop();
      vi.useRealTimers();
    }
  });
});

describe("a subscription that has fallen behind the Gateway", () => {
  it("logs it once, regardless of how many browsers are listening", async () => {
    const alarm = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway);
    fanout.listen(aListener());
    fanout.listen(aListener());

    opened[0]?.onNotice({ kind: "gap", cause: "subscriber_behind", missed: 256 });

    expect(alarm).toHaveBeenCalledTimes(1);
    expect(alarm).toHaveBeenCalledWith(expect.stringContaining("256"));

    fanout.stop();
    await settle();
  });

  it("says nothing for a reconnect, which the Gateway already accounts for", async () => {
    const alarm = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { gateway, opened } = aGateway();
    const fanout = fanoutEvents(gateway);

    opened[0]?.onNotice(A_GAP);

    expect(alarm).not.toHaveBeenCalled();

    fanout.stop();
    await settle();
  });
});

describe("a fanout that has been stopped", () => {
  it("cancels what it was holding and opens nothing more", async () => {
    const { gateway, opened, cancelled } = aGateway();
    const fanout = fanoutEvents(gateway, {
      baseMs: 0,
      ceilingMs: 0,
      jitter: () => 0,
    });

    fanout.stop();

    expect(cancelled).toEqual([0]);
    expect(fanout.subscribed()).toBe(false);

    // The cancellation ends the stream, which is the same callback a
    // Gateway going away would use. Stopping has to mean stopping either
    // way.
    opened[0]?.onEnded(CLEANLY);
    await settle();

    expect(opened).toHaveLength(1);
    expect(fanout.subscribed()).toBe(false);
  });
});

describe("the channel", () => {
  it("is asked about rather than remembered", async () => {
    const isChannelReady = vi.fn(() => true);
    const { gateway } = aGateway();
    const fanout = fanoutEvents(
      { ...gateway, isChannelReady },
      { baseMs: 0, ceilingMs: 0, jitter: () => 0 },
    );

    fanout.channelConnected();
    fanout.channelConnected();

    // Twice, because a connectivity state read at startup is a claim about
    // startup, and a probe is asking about now.
    expect(isChannelReady).toHaveBeenCalledTimes(2);

    fanout.stop();
    await settle();
  });
});
