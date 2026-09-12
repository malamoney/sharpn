import { describe, expect, it } from "vitest";

import { messageForOutcome } from "./acknowledgementMessage.js";

describe("what an Outcome is shown as", () => {
  it("says nothing at all about success — it is what a fresh read is for", () => {
    // ADR 0001: an Acknowledgement is evidence a Command was accepted, never
    // evidence of what a Light now is. `success` earns silence, not a claim
    // about the Light's new state.
    expect(messageForOutcome("success")).toBeUndefined();
  });

  it("says a rejection plainly, without implying anything was half-applied", () => {
    expect(messageForOutcome("rejected")).toMatch(/would not/i);
  });

  it("says a partial outcome happened, without claiming which half", () => {
    expect(messageForOutcome("partial")).toMatch(/only some/i);
  });

  it("never uses the word failed for unknown — the Command may have applied", () => {
    const message = messageForOutcome("unknown");

    expect(message?.toLowerCase()).not.toContain("fail");
    expect(message).toMatch(/took too long|nobody knows|may have/i);
  });
});
