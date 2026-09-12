import type { Acknowledgement } from "../api/types.js";

/** An Acknowledgement, defaulting to `success`, for a test to override. */
export function anAcknowledgement(overrides: Partial<Acknowledgement>): Acknowledgement {
  return {
    outcome: "success",
    updated: [],
    errors: [],
    correlationId: "corr-1",
    ...overrides,
  };
}
