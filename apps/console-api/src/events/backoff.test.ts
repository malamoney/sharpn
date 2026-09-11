import { describe, expect, it } from "vitest";

import { DEFAULT_BACKOFF, delays, fullJitter } from "./backoff.js";

/** A jitter that draws whatever the test queues up next, in order. */
function scripted(...draws: number[]): (ceiling: number) => number {
  const remaining = [...draws];

  return (ceiling) => remaining.shift() ?? ceiling;
}

describe("delays", () => {
  it("doubles the ceiling each time, starting from the base", () => {
    const seen: number[] = [];
    const next = delays({
      baseMs: 100,
      ceilingMs: 10_000,
      jitter: (ceiling) => {
        seen.push(ceiling);
        return ceiling;
      },
    });

    next();
    next();
    next();
    next();

    expect(seen).toEqual([100, 200, 400, 800]);
  });

  it("stops doubling once the ceiling is reached", () => {
    const seen: number[] = [];
    const next = delays({
      baseMs: 100,
      ceilingMs: 300,
      jitter: (ceiling) => {
        seen.push(ceiling);
        return ceiling;
      },
    });

    next();
    next();
    next();
    next();

    expect(seen).toEqual([100, 200, 300, 300]);
  });

  it("draws every wait from the jitter, not the raw ceiling", () => {
    const next = delays({
      baseMs: 100,
      ceilingMs: 10_000,
      jitter: scripted(7, 250),
    });

    expect(next()).toBe(7);
    expect(next()).toBe(250);
  });

  it("starts a fresh schedule every time it is called", () => {
    const seen: number[] = [];
    const backoff = {
      baseMs: 100,
      ceilingMs: 10_000,
      jitter: (ceiling: number) => {
        seen.push(ceiling);
        return ceiling;
      },
    };

    delays(backoff)();
    delays(backoff)();

    expect(seen).toEqual([100, 100]);
  });

  it("refuses a backoff whose ceiling is below its base", () => {
    expect(() => delays({ baseMs: 1000, ceilingMs: 500, jitter: fullJitter })).toThrow();
  });

  it("defaults to a full jitter within the ceiling", () => {
    const next = delays(DEFAULT_BACKOFF);

    const delay = next();

    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(DEFAULT_BACKOFF.baseMs);
  });
});

describe("fullJitter", () => {
  it("draws within [0, ceiling]", () => {
    for (let i = 0; i < 20; i += 1) {
      const draw = fullJitter(1000);
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThanOrEqual(1000);
    }
  });
});
