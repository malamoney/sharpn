import { describe, expect, it } from "vitest";

import { ApiError } from "../api/apiError.js";
import { anAcknowledgement } from "../test/acknowledgements.js";
import { messageForError, messageForOutcome } from "./acknowledgementMessage.js";

describe("what an Outcome is shown as", () => {
  it("says nothing at all about success — it is what a fresh read is for", () => {
    // ADR 0001: an Acknowledgement is evidence a Command was accepted, never
    // evidence of what a Light now is. `success` earns silence, not a claim
    // about the Light's new state.
    expect(messageForOutcome(anAcknowledgement({ outcome: "success" }))).toBeUndefined();
  });

  it("says a rejection plainly, without implying anything was half-applied", () => {
    expect(messageForOutcome(anAcknowledgement({ outcome: "rejected" }))).toMatch(
      /would not/i,
    );
  });

  it("surfaces a partial outcome's errors[].description verbatim — the entire diagnostic there is", () => {
    // Issue #8: paraphrasing it away would destroy the only information a
    // partial outcome carries.
    const message = messageForOutcome(
      anAcknowledgement({
        outcome: "partial",
        errors: [{ description: "the Bridge rejected the colour" }],
      }),
    );

    expect(message).toBe("the Bridge rejected the colour");
  });

  it("joins more than one error verbatim for a partial outcome", () => {
    const message = messageForOutcome(
      anAcknowledgement({
        outcome: "partial",
        errors: [{ description: "first refusal" }, { description: "second refusal" }],
      }),
    );

    expect(message).toContain("first refusal");
    expect(message).toContain("second refusal");
  });

  it("never uses the word failed for unknown — the Command may have applied", () => {
    const message = messageForOutcome(anAcknowledgement({ outcome: "unknown" }));

    expect(message?.toLowerCase()).not.toContain("fail");
  });
});

describe("what MUTATION_OUTCOME_UNKNOWN is shown as", () => {
  it("shows the same transient couldn't-confirm notice as an unknown outcome, not the raw error message", () => {
    const error = new ApiError({
      code: "MUTATION_OUTCOME_UNKNOWN",
      message: "An update took too long, so the Command may have been applied.",
      correlationId: "corr-2",
    });

    const message = messageForError(error);

    expect(message.toLowerCase()).not.toContain("fail");
    expect(message).toBe(messageForOutcome(anAcknowledgement({ outcome: "unknown" })));
  });

  it("shows any other ApiError's own message unchanged", () => {
    const error = new ApiError({
      code: "BRIDGE_UNREACHABLE",
      message: "The Gateway could not reach the Bridge.",
      correlationId: "corr-3",
    });

    expect(messageForError(error)).toBe("The Gateway could not reach the Bridge.");
  });
});
