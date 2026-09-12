import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PendingCommandsProvider,
  usePendingCommands,
} from "./PendingCommandsProvider.js";

describe("clearing a Pending Command", () => {
  it("clears unconditionally when no sentAt guard is given", () => {
    const { result } = renderHook(() => usePendingCommands(), {
      wrapper: PendingCommandsProvider,
    });

    act(() => {
      result.current.setPending({ lightId: "l1", command: { on: true }, sentAt: 1 });
    });
    expect(result.current.pending["l1"]).toBeDefined();

    act(() => {
      result.current.clearPending("l1");
    });
    expect(result.current.pending["l1"]).toBeUndefined();
  });

  it("does not clear a newer Command when a stale completion names an older sentAt", () => {
    // A drag started, its Command sent (sentAt: 1), then a second drag
    // started and sent its own Command (sentAt: 2) before the first's
    // Acknowledgement — or its own transport error — arrived. The first
    // settling must not delete the second's Pending Command.
    const { result } = renderHook(() => usePendingCommands(), {
      wrapper: PendingCommandsProvider,
    });

    act(() => {
      result.current.setPending({ lightId: "l1", command: { on: true }, sentAt: 1 });
    });
    act(() => {
      result.current.setPending({ lightId: "l1", command: { on: false }, sentAt: 2 });
    });

    act(() => {
      result.current.clearPending("l1", 1);
    });

    expect(result.current.pending["l1"]).toEqual({
      lightId: "l1",
      command: { on: false },
      sentAt: 2,
    });
  });

  it("clears when the sentAt guard matches the entry actually stored", () => {
    const { result } = renderHook(() => usePendingCommands(), {
      wrapper: PendingCommandsProvider,
    });

    act(() => {
      result.current.setPending({ lightId: "l1", command: { on: true }, sentAt: 1 });
    });

    act(() => {
      result.current.clearPending("l1", 1);
    });

    expect(result.current.pending["l1"]).toBeUndefined();
  });
});
