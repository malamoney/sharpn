/**
 * The Mutation meter, driven by a clock the test owns.
 *
 * Time is injected rather than faked globally because what is being asserted
 * is arithmetic about a window — when it refuses, and how long it says to wait
 * — and a test that has to move a global clock to ask that question is a test
 * about timers instead.
 */
import { describe, expect, it } from "vitest";

import { meterAtMost, MUTATIONS_PER_MINUTE, WINDOW_MS } from "./meter.js";

/** A clock that starts at a round number and only moves when told to. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000_000;

  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

describe("a session's Mutations", () => {
  it("are allowed up to the minute's worth", () => {
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, clock().now);

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      expect(meter.spend("session"), `mutation ${sent + 1}`).toEqual({
        allowed: true,
      });
    }
  });

  it("are refused past it, with how long to wait", () => {
    const time = clock();
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, time.now);

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      meter.spend("session");
    }
    // A third of the way through the window, so that the answer is the time
    // left on the *oldest* Mutation rather than a whole window from now.
    time.advance(WINDOW_MS / 3);

    expect(meter.spend("session")).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  it("never says to wait zero seconds, which reads as 'go now'", () => {
    const time = clock();
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, time.now);

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      meter.spend("session");
    }
    // One millisecond short of the oldest Mutation ageing out: the honest
    // answer rounds to nothing, and a `Retry-After: 0` invites the retry the
    // refusal was for.
    time.advance(WINDOW_MS - 1);

    expect(meter.spend("session")).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("are allowed again as the oldest ones age out of the window", () => {
    const time = clock();
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, time.now);

    meter.spend("session");
    time.advance(WINDOW_MS / 2);
    for (let sent = 1; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      meter.spend("session");
    }

    expect(meter.spend("session")).toMatchObject({ allowed: false });

    // Far enough for the first Mutation to leave the window and nothing else.
    time.advance(WINDOW_MS / 2);

    expect(meter.spend("session")).toEqual({ allowed: true });
    expect(meter.spend("session")).toMatchObject({ allowed: false });
  });
});

describe("one session's Mutations", () => {
  it("are not counted against another's", () => {
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, clock().now);

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      meter.spend("one");
    }

    expect(meter.spend("one")).toMatchObject({ allowed: false });
    expect(meter.spend("another")).toEqual({ allowed: true });
  });
});

describe("a session that has stopped sending", () => {
  it("is forgotten, so the meter is bounded by who is active", () => {
    const time = clock();
    const meter = meterAtMost(MUTATIONS_PER_MINUTE, time.now);

    meter.spend("gone");
    time.advance(WINDOW_MS + 1);
    // Any spend sweeps: the meter holds the keys that spent inside the last
    // window and nothing else, so a process that has answered a million
    // browsers is not still holding a million counters.
    meter.spend("here");

    expect(meter.remembering()).toEqual(["here"]);
  });
});
