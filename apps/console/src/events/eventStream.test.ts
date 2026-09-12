import { describe, expect, it, vi } from "vitest";

import { openEventStream, type EventStreamHandlers } from "./eventStream.js";

/**
 * A stand-in for `EventSource`, driven by hand rather than by a real
 * connection or the real class's own reconnect timers.
 */
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  close = vi.fn();

  constructor(url: string, init?: EventSourceInit) {
    super();
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  emit(type: string, data?: unknown): void {
    this.dispatchEvent(
      data === undefined
        ? new Event(type)
        : new MessageEvent(type, { data: JSON.stringify(data) }),
    );
  }
}

function handlers(): EventStreamHandlers {
  return {
    onLightNotice: vi.fn(),
    onConnectionStatus: vi.fn(),
    onStreamOpen: vi.fn(),
    onStreamDown: vi.fn(),
  };
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) {
    throw new Error("no FakeEventSource was constructed");
  }
  return source;
}

describe("opening the stream", () => {
  it("connects with credentials, so the session cookie rides along", () => {
    openEventStream(
      "/api/v1/events",
      handlers(),
      FakeEventSource as unknown as typeof EventSource,
    );

    expect(latestSource().url).toBe("/api/v1/events");
    expect(latestSource().withCredentials).toBe(true);
  });

  it("reports the first open as not a reconnect, and every open after as one", () => {
    const h = handlers();
    openEventStream("/api/v1/events", h, FakeEventSource as unknown as typeof EventSource);
    const source = latestSource();

    source.emit("open");
    source.emit("open");
    source.emit("open");

    expect(h.onStreamOpen).toHaveBeenNthCalledWith(1, false);
    expect(h.onStreamOpen).toHaveBeenNthCalledWith(2, true);
    expect(h.onStreamOpen).toHaveBeenNthCalledWith(3, true);
  });

  it("reports an error as the stream going down", () => {
    const h = handlers();
    openEventStream("/api/v1/events", h, FakeEventSource as unknown as typeof EventSource);

    latestSource().emit("error");

    expect(h.onStreamDown).toHaveBeenCalledOnce();
  });
});

describe("decoding what arrives", () => {
  it("reads a light.changed frame as an Invalidation with an id and nothing else", () => {
    const h = handlers();
    openEventStream("/api/v1/events", h, FakeEventSource as unknown as typeof EventSource);

    latestSource().emit("light.changed", { id: "kitchen-1" });

    expect(h.onLightNotice).toHaveBeenCalledWith({
      id: "kitchen-1",
      change: "changed",
    });
  });

  it("reads light.added and light.removed the same way", () => {
    const h = handlers();
    openEventStream("/api/v1/events", h, FakeEventSource as unknown as typeof EventSource);
    const source = latestSource();

    source.emit("light.added", { id: "new-1" });
    source.emit("light.removed", { id: "gone-1" });

    expect(h.onLightNotice).toHaveBeenNthCalledWith(1, {
      id: "new-1",
      change: "added",
    });
    expect(h.onLightNotice).toHaveBeenNthCalledWith(2, {
      id: "gone-1",
      change: "removed",
    });
  });

  it("reads a connection frame as the Gateway status it carries", () => {
    const h = handlers();
    openEventStream("/api/v1/events", h, FakeEventSource as unknown as typeof EventSource);

    latestSource().emit("connection", { gateway: "reconnecting", resyncing: true });

    expect(h.onConnectionStatus).toHaveBeenCalledWith({
      gateway: "reconnecting",
      resyncing: true,
    });
  });
});

describe("closing the stream", () => {
  it("closes the underlying EventSource", () => {
    const handle = openEventStream(
      "/api/v1/events",
      handlers(),
      FakeEventSource as unknown as typeof EventSource,
    );

    handle.close();

    expect(latestSource().close).toHaveBeenCalledOnce();
  });
});
