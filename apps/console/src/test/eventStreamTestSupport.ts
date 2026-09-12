/**
 * Reading what a test's `vi.mock("...events/eventStream.js")` was called
 * with. A test still declares that `vi.mock` itself — vitest hoists it and
 * it must live in the file that needs it — but the two small helpers for
 * reading the mock back are the same regardless of which relative path got
 * there, so they live here once.
 */
import { vi } from "vitest";

import { openEventStream, type EventStreamHandlers } from "../events/eventStream.js";

export function openEventStreamMock() {
  return vi.mocked(openEventStream);
}

export function handlersPassedIn(): EventStreamHandlers {
  const [, handlers] = openEventStreamMock().mock.calls.at(-1) ?? [];
  if (handlers === undefined) {
    throw new Error("openEventStream was never called");
  }
  return handlers;
}
