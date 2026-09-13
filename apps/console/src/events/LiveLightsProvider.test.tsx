import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { lightDetailKey, lightsListKey, LIGHTS } from "../queries/queryKeys.js";
import { handlersPassedIn, openEventStreamMock } from "../test/eventStreamTestSupport.js";
import * as eventStreamModule from "./eventStream.js";
import { LiveLightsProvider, useLiveStatus } from "./LiveLightsProvider.js";

vi.mock("./eventStream.js", async () => {
  const actual = await vi.importActual<typeof eventStreamModule>("./eventStream.js");
  return { ...actual, openEventStream: vi.fn() };
});

function renderProvider(queryClient: QueryClient) {
  openEventStreamMock().mockReturnValue({ close: vi.fn() });

  function StatusProbe() {
    const status = useLiveStatus();
    return <span data-testid="status">{JSON.stringify(status)}</span>;
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <LiveLightsProvider>
        <StatusProbe />
      </LiveLightsProvider>
    </QueryClientProvider>,
  );
}

function aQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("light.changed", () => {
  it("invalidates that Light's detail query and the list it also appears in, and nothing wider", () => {
    const queryClient = aQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    renderProvider(queryClient);

    handlersPassedIn().onLightNotice({ id: "l1", change: "changed" });

    expect(spy).toHaveBeenCalledWith({ queryKey: lightDetailKey("l1"), exact: true });
    expect(spy).toHaveBeenCalledWith({ queryKey: lightsListKey, exact: true });
    // Never the prefix: a sibling's detail query has nothing to do with l1.
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: LIGHTS }));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("light.added and light.removed", () => {
  it("invalidates the list, not a detail query that may not exist or matter any more", () => {
    const queryClient = aQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    renderProvider(queryClient);

    handlersPassedIn().onLightNotice({ id: "new-1", change: "added" });

    expect(spy).toHaveBeenCalledWith({ queryKey: lightsListKey, exact: true });
    expect(spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: lightDetailKey("new-1") }),
    );

    spy.mockClear();
    handlersPassedIn().onLightNotice({ id: "gone-1", change: "removed" });

    expect(spy).toHaveBeenCalledWith({ queryKey: lightsListKey, exact: true });
  });
});

describe("full-collection refetch", () => {
  it("refetches everything when the Console API's own subscription recovers (reconnecting -> connected)", () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);
    const handlers = handlersPassedIn();

    handlers.onConnectionStatus({ gateway: "reconnecting", resyncing: false });

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    handlers.onConnectionStatus({ gateway: "connected", resyncing: false });

    expect(spy).toHaveBeenCalledWith({ queryKey: LIGHTS, exact: false });
  });

  it("does not refetch on the first connected status ever seen", () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);
    const handlers = handlersPassedIn();

    const spy = vi.spyOn(queryClient, "invalidateQueries");
    handlers.onConnectionStatus({ gateway: "connected", resyncing: false });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: LIGHTS, exact: false });
  });

  it("does not refetch on a resyncing pulse alone (CAUSE_RECONNECTED, which the Gateway resyncs)", () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);
    const handlers = handlersPassedIn();

    handlers.onConnectionStatus({ gateway: "connected", resyncing: false });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    handlers.onConnectionStatus({ gateway: "connected", resyncing: true });
    handlers.onConnectionStatus({ gateway: "connected", resyncing: false });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: LIGHTS, exact: false });
  });

  it("does not refetch merely because this browser's own stream reopened", () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);
    const handlers = handlersPassedIn();

    handlers.onConnectionStatus({ gateway: "connected", resyncing: false });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    handlers.onStreamDown();
    handlers.onStreamOpen(true);

    expect(spy).not.toHaveBeenCalledWith({ queryKey: LIGHTS, exact: false });
  });
});

describe("useLiveStatus", () => {
  it("starts connecting, then reflects the connection status the stream reports", async () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);

    expect(screen.getByTestId("status")).toHaveTextContent(
      JSON.stringify({ kind: "connecting" }),
    );

    handlersPassedIn().onConnectionStatus({ gateway: "connected", resyncing: false });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent(
        JSON.stringify({ kind: "connected", gateway: "connected", resyncing: false }),
      );
    });
  });

  it("reports disconnected when the stream goes down", async () => {
    const queryClient = aQueryClient();
    renderProvider(queryClient);

    handlersPassedIn().onStreamDown();

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent(
        JSON.stringify({ kind: "disconnected" }),
      );
    });
  });
});

describe("closing", () => {
  it("closes the stream on unmount", () => {
    const queryClient = aQueryClient();
    const close = vi.fn();
    openEventStreamMock().mockReturnValue({ close });

    function StatusProbe() {
      useQueryClient();
      return null;
    }

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <LiveLightsProvider>
          <StatusProbe />
        </LiveLightsProvider>
      </QueryClientProvider>,
    );

    unmount();

    expect(close).toHaveBeenCalledOnce();
  });
});
