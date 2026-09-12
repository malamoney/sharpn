import { describe, expect, it } from "vitest";

import { isSupersededByAReadAfter } from "./pendingCommand.js";
import type { PendingCommand } from "./pendingCommand.js";

function aPendingCommand(overrides: Partial<PendingCommand> = {}): PendingCommand {
  return {
    lightId: "light-1",
    command: { on: true },
    sentAt: 1_000,
    ...overrides,
  };
}

describe("whether a read supersedes a Pending Command", () => {
  it("is not superseded by a read that came before it was sent", () => {
    expect(isSupersededByAReadAfter(aPendingCommand({ sentAt: 1_000 }), 500)).toBe(
      false,
    );
  });

  it("is not superseded by a read from the exact instant it was sent", () => {
    // The Command was sent and the read raced it; the read cannot be
    // evidence about a Command it did not yet know about.
    expect(isSupersededByAReadAfter(aPendingCommand({ sentAt: 1_000 }), 1_000)).toBe(
      false,
    );
  });

  it("is superseded by any read after it was sent, whatever that read says", () => {
    // Per ADR 0001, the only thing to do with a fresher read is believe it —
    // not compare it against what was asked for.
    expect(isSupersededByAReadAfter(aPendingCommand({ sentAt: 1_000 }), 1_001)).toBe(
      true,
    );
  });
});
