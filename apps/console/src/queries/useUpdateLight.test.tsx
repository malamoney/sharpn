import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/apiError.js";
import * as lightsApi from "../api/lights.js";
import type { Acknowledgement } from "../api/types.js";
import { PendingCommandsProvider, usePendingCommands } from "../pending/PendingCommandsProvider.js";
import { anAcknowledgement } from "../test/acknowledgements.js";
import { deferred } from "../test/deferred.js";
import { lightDetailKey } from "./queryKeys.js";
import { useUpdateLight } from "./useUpdateLight.js";

vi.mock("../api/lights.js");

function setUp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PendingCommandsProvider>{children}</PendingCommandsProvider>
      </QueryClientProvider>
    );
  }

  const { result } = renderHook(
    () => ({ update: useUpdateLight(), pending: usePendingCommands() }),
    { wrapper },
  );

  return { queryClient, result };
}

describe("sending a Command with nothing else in flight", () => {
  it("sends immediately and tracks it as a Pending Command", async () => {
    vi.mocked(lightsApi.updateLight).mockReturnValue(new Promise(() => undefined));
    const { result } = setUp();

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve();
    });

    expect(lightsApi.updateLight).toHaveBeenCalledExactlyOnceWith("l1", { brightness: 50 });
    expect(result.current.pending.pending["l1"]?.command).toEqual({ brightness: 50 });
  });
});

describe("the slider policy: at most one PATCH in flight per Light", () => {
  it("holds a second Command for the same Light while the first is in flight, then sends it once the first settles", async () => {
    const first = deferred<Acknowledgement>();
    vi.mocked(lightsApi.updateLight).mockReturnValueOnce(first.promise);
    const { result } = setUp();

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve();
    });
    act(() => {
      result.current.update.send("l1", { brightness: 80 });
    });

    // Only the first has actually gone out — the second is held, not fired
    // concurrently.
    expect(lightsApi.updateLight).toHaveBeenCalledExactlyOnceWith("l1", { brightness: 50 });

    vi.mocked(lightsApi.updateLight).mockResolvedValueOnce(anAcknowledgement({}));
    await act(async () => {
      first.resolve(anAcknowledgement({}));
      await first.promise;
    });

    await waitFor(() => {
      expect(lightsApi.updateLight).toHaveBeenCalledTimes(2);
    });
    expect(lightsApi.updateLight).toHaveBeenLastCalledWith("l1", { brightness: 80 });
  });

  it("guarantees the trailing (most recent) held value wins over an earlier one it superseded", async () => {
    const first = deferred<Acknowledgement>();
    vi.mocked(lightsApi.updateLight).mockReturnValueOnce(first.promise);
    const { result } = setUp();

    act(() => {
      result.current.update.send("l1", { brightness: 10 });
    });
    act(() => {
      result.current.update.send("l1", { brightness: 20 });
    });
    act(() => {
      result.current.update.send("l1", { brightness: 30 });
    });

    vi.mocked(lightsApi.updateLight).mockResolvedValueOnce(anAcknowledgement({}));
    await act(async () => {
      first.resolve(anAcknowledgement({}));
      await first.promise;
    });

    await waitFor(() => {
      expect(lightsApi.updateLight).toHaveBeenCalledTimes(2);
    });
    expect(lightsApi.updateLight).toHaveBeenLastCalledWith("l1", { brightness: 30 });
  });

  it("does not resend once settled if the held value no longer differs from what was just sent", async () => {
    const first = deferred<Acknowledgement>();
    vi.mocked(lightsApi.updateLight).mockReturnValueOnce(first.promise);
    const { result } = setUp();

    act(() => {
      result.current.update.send("l1", { brightness: 50 });
    });
    act(() => {
      result.current.update.send("l1", { brightness: 50 });
    });

    await act(async () => {
      first.resolve(anAcknowledgement({}));
      await first.promise;
    });

    // Give any (incorrect) follow-up a chance to fire before asserting it
    // did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lightsApi.updateLight).toHaveBeenCalledTimes(1);
  });

  it("keeps two different Lights independent — one in flight never holds up the other", async () => {
    vi.mocked(lightsApi.updateLight).mockReturnValue(new Promise(() => undefined));
    const { result } = setUp();

    await act(async () => {
      result.current.update.send("l1", { on: true });
      result.current.update.send("l2", { on: false });
      await Promise.resolve();
    });

    expect(lightsApi.updateLight).toHaveBeenCalledWith("l1", { on: true });
    expect(lightsApi.updateLight).toHaveBeenCalledWith("l2", { on: false });
    expect(lightsApi.updateLight).toHaveBeenCalledTimes(2);
  });
});

describe("after partial or MUTATION_OUTCOME_UNKNOWN", () => {
  it("clears the Pending Command and refetches that Light on a partial outcome", async () => {
    vi.mocked(lightsApi.updateLight).mockResolvedValue(
      anAcknowledgement({
        outcome: "partial",
        errors: [{ description: "the Bridge rejected the colour" }],
      }),
    );
    const { result, queryClient } = setUp();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.pending.pending["l1"]).toBeUndefined();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lightDetailKey("l1"),
      exact: true,
    });
  });

  it("clears the Pending Command and refetches that Light when the Acknowledgement itself says unknown", async () => {
    vi.mocked(lightsApi.updateLight).mockResolvedValue(anAcknowledgement({ outcome: "unknown" }));
    const { result, queryClient } = setUp();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.pending.pending["l1"]).toBeUndefined();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lightDetailKey("l1"),
      exact: true,
    });
  });

  it("clears the Pending Command and refetches that Light on MUTATION_OUTCOME_UNKNOWN", async () => {
    vi.mocked(lightsApi.updateLight).mockRejectedValue(
      new ApiError({
        code: "MUTATION_OUTCOME_UNKNOWN",
        message: "An update took too long.",
        correlationId: "corr-9",
      }),
    );
    const { result, queryClient } = setUp();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve().then(() => Promise.resolve());
    });

    await waitFor(() => {
      expect(result.current.pending.pending["l1"]).toBeUndefined();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: lightDetailKey("l1"),
      exact: true,
    });
  });
});

describe("a rejection or an ordinary transport failure", () => {
  it("clears the Pending Command immediately without refetching — nothing was applied to read", async () => {
    vi.mocked(lightsApi.updateLight).mockResolvedValue(
      anAcknowledgement({ outcome: "rejected", updated: [], errors: [{ description: "no" }] }),
    );
    const { result, queryClient } = setUp();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.pending.pending["l1"]).toBeUndefined();
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: lightDetailKey("l1"),
      exact: true,
    });
  });

  it("clears the Pending Command immediately on an unrelated ApiError, without refetching", async () => {
    vi.mocked(lightsApi.updateLight).mockRejectedValue(
      new ApiError({
        code: "BRIDGE_UNREACHABLE",
        message: "The Gateway could not reach the Bridge.",
        correlationId: "corr-8",
      }),
    );
    const { result, queryClient } = setUp();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.update.send("l1", { brightness: 50 });
      await Promise.resolve().then(() => Promise.resolve());
    });

    await waitFor(() => {
      expect(result.current.pending.pending["l1"]).toBeUndefined();
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: lightDetailKey("l1"),
      exact: true,
    });
  });
});
