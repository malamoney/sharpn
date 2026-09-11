/**
 * What a PATCH answers with.
 *
 * ADR 0001: an Acknowledgement is evidence that a Command was accepted, and
 * never evidence that a bulb is now lit a particular way. The shape is what
 * makes that true, so the shape is what is asserted here.
 */
import { describe, expect, it } from "vitest";

import { acknowledgementSchema } from "./acknowledgement.js";

const acknowledgement = {
  outcome: "success",
  updated: [{ rid: "0ec23e3a-5e1b-4c3f-9a6b-1f2f4d0a7c11", rtype: "light" }],
  errors: [],
  correlationId: "01JB2S0Z3M0000000000000000",
};

describe("the Acknowledgement", () => {
  it("carries an Outcome, the identifiers, the words and the id", () => {
    expect(acknowledgementSchema.parse(acknowledgement)).toEqual(
      acknowledgement,
    );
  });

  it("carries no Light, and has nowhere to put one", () => {
    // The Gateway's MutationResponse has no way to report state, so neither
    // has this. A field for it here is what would let the Console render what
    // it asked for as what is true.
    expect(Object.keys(acknowledgementSchema.shape).sort()).toEqual([
      "correlationId",
      "errors",
      "outcome",
      "updated",
    ]);
  });

  it("keeps a Bridge error as a description of its own", () => {
    // `Error` is generated from Hue's spec and carries one field today. Kept
    // as an object rather than flattened to a string, so a Bridge that reports
    // more than a description reaches the Console as a wider object rather
    // than as a breaking change.
    const partial = {
      ...acknowledgement,
      outcome: "partial",
      errors: [{ description: "invalid value, dimming.brightness, 101" }],
    };

    expect(acknowledgementSchema.parse(partial).errors[0]?.description).toBe(
      "invalid value, dimming.brightness, 101",
    );
  });

  it("knows the four Outcomes and no others", () => {
    for (const outcome of ["success", "partial", "rejected", "unknown"]) {
      const parsed = acknowledgementSchema.safeParse({
        ...acknowledgement,
        outcome,
      });

      expect(parsed.success).toBe(true);
    }

    expect(
      acknowledgementSchema.safeParse({ ...acknowledgement, outcome: "failed" })
        .success,
    ).toBe(false);
  });
});
