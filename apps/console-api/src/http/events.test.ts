/**
 * `openStreams`'s own bookkeeping, in isolation from any actual HTTP.
 *
 * The route itself — what a browser is sent, and when — is `app.test.ts`'s,
 * over real HTTP with a real server, the same as every other route. This is
 * the one piece of standalone logic events.ts has, the same reason
 * `meter.ts` gets its own file rather than being asked only through
 * `app.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import { openStreams } from "./events.js";

describe("a stream registry", () => {
  it("ends every stream it is holding", () => {
    const streams = openStreams();
    const a = vi.fn();
    const b = vi.fn();
    streams.track(a);
    streams.track(b);

    streams.closeAll();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("does not end a stream once it has untracked itself", () => {
    const streams = openStreams();
    const ended = vi.fn();
    const untrack = streams.track(ended);

    untrack();
    streams.closeAll();

    expect(ended).not.toHaveBeenCalled();
  });

  it("copes with a stream ending itself from inside closeAll", () => {
    // Every real `end` untracks itself as its own last step (`http/events.ts`),
    // so `closeAll` is always mutating the same Set it is iterating.
    const streams = openStreams();
    let untrack: () => void = () => undefined;
    const end = vi.fn(() => {
      untrack();
    });
    untrack = streams.track(end);
    streams.track(vi.fn());

    expect(() => streams.closeAll()).not.toThrow();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
