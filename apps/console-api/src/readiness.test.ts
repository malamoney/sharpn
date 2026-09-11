/**
 * What the watch says, against a Gateway whose subscription the test drives.
 *
 * The question here is only ever about timing — when the watch believes it has
 * a subscription and when it stops believing it — so the Gateway is a stand-in
 * that hands back the Subscriber and lets the test be the one that ends it.
 */
import { describe, expect, it, vi } from "vitest";

import type { Gateway, Subscriber } from "./gateway/index.js";
import { watchTheGateway } from "./readiness.js";

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

describe("a watch that has just started", () => {
  it("has asked for a subscription and says it has one", async () => {
    const { gateway, opened } = aGateway();

    const watch = watchTheGateway(gateway);

    expect(opened).toHaveLength(1);
    expect(watch.subscribed()).toBe(true);

    watch.stop();
    await settle();
  });
});

describe("a subscription that has ended", () => {
  it("is reported lost, and another is opened", async () => {
    const { gateway, opened } = aGateway();
    const watch = watchTheGateway(gateway, 0);

    opened[0]?.onEnded(CLEANLY);

    expect(watch.subscribed()).toBe(false);

    await settle();

    expect(opened).toHaveLength(2);
    expect(watch.subscribed()).toBe(true);

    watch.stop();
    await settle();
  });

  it("is lost even when it ended inside the call that opened it", () => {
    // A Gateway that is not there is not a call that fails: the Subscribe
    // succeeds locally and the stream ends. When that happens fast enough to
    // land before `subscribe` has returned, the watch has to have noticed.
    const { gateway } = aGateway();

    const watch = watchTheGateway(
      {
        ...gateway,
        subscribe(subscriber) {
          subscriber.onEnded(CLEANLY);

          return { cancel: () => undefined };
        },
      },
      0,
    );

    expect(watch.subscribed()).toBe(false);
    watch.stop();
  });
});

describe("a watch that has been stopped", () => {
  it("cancels what it was holding and opens nothing more", async () => {
    const { gateway, opened, cancelled } = aGateway();
    const watch = watchTheGateway(gateway, 0);

    watch.stop();

    expect(cancelled).toEqual([0]);
    expect(watch.subscribed()).toBe(false);

    // The cancellation ends the stream, which is the same callback a Gateway
    // going away would use. Stopping has to mean stopping either way.
    opened[0]?.onEnded(CLEANLY);
    await settle();

    expect(opened).toHaveLength(1);
    expect(watch.subscribed()).toBe(false);
  });
});

describe("the channel", () => {
  it("is asked about rather than remembered", async () => {
    const isChannelReady = vi.fn(() => true);
    const { gateway } = aGateway();
    const watch = watchTheGateway({ ...gateway, isChannelReady }, 0);

    watch.channelConnected();
    watch.channelConnected();

    // Twice, because a connectivity state read at startup is a claim about
    // startup, and a probe is asking about now.
    expect(isChannelReady).toHaveBeenCalledTimes(2);

    watch.stop();
    await settle();
  });
});
