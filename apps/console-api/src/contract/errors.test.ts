/**
 * The error envelope, and which failure becomes which code.
 *
 * The tables below are transcribed from issue #2 rather than read out of the
 * implementation, so the two have to agree with the same third thing. Two of
 * the rows are deliberate oddities and have tests of their own, because they
 * are the ones somebody will one day read as a bug.
 */
import { describe, expect, it } from "vitest";

import {
  ERROR_CODES,
  ERRORS,
  errorCodeForGatewayFailure,
  errorEnvelopeSchema,
} from "./errors.js";

describe("what a Gateway failure becomes", () => {
  const table = [
    ["INVALID_ARGUMENT", "BRIDGE_REJECTED_COMMAND", 400],
    ["NOT_FOUND", "LIGHT_NOT_FOUND", 404],
    ["FAILED_PRECONDITION", "GATEWAY_NOT_PAIRED", 503],
    ["UNAVAILABLE", "BRIDGE_UNREACHABLE", 503],
    ["RESOURCE_EXHAUSTED", "BRIDGE_BUSY", 503],
    ["UNIMPLEMENTED", "BRIDGE_UNSUPPORTED", 501],
    ["UNAUTHENTICATED", "GATEWAY_MISCONFIGURED", 500],
    ["INTERNAL", "GATEWAY_ERROR", 502],
    ["CHANNEL_DOWN", "GATEWAY_UNREACHABLE", 503],
  ] as const;

  it.each(table)("answers %s with %s (%i)", (failure, code, httpStatus) => {
    expect(errorCodeForGatewayFailure(failure, "read")).toBe(code);
    expect(errorCodeForGatewayFailure(failure, "update")).toBe(code);
    expect(ERRORS[code].httpStatus).toBe(httpStatus);
  });

  it("tells a timed-out read from a timed-out update", () => {
    // Nothing was changed by asking, and the Gateway has already retried it
    // three times.
    expect(errorCodeForGatewayFailure("DEADLINE_EXCEEDED", "read")).toBe(
      "BRIDGE_TIMEOUT",
    );
    // The Command may well have been applied and the reply lost. It is not a
    // failure and must never be reported as one.
    expect(errorCodeForGatewayFailure("DEADLINE_EXCEEDED", "update")).toBe(
      "MUTATION_OUTCOME_UNKNOWN",
    );
    expect(ERRORS.BRIDGE_TIMEOUT.httpStatus).toBe(504);
    expect(ERRORS.MUTATION_OUTCOME_UNKNOWN.httpStatus).toBe(504);
  });

  it("answers a status it has never heard of with GATEWAY_ERROR", () => {
    // A status this table does not carry is the Gateway failing in a way
    // nothing here anticipated, which is what 502 is for. Guessing at a
    // closer-looking row would be inventing a meaning for it.
    expect(errorCodeForGatewayFailure("DATA_LOSS", "read")).toBe(
      "GATEWAY_ERROR",
    );
  });
});

describe("the two rows nobody should tidy up", () => {
  it("answers a busy Bridge with 503 and a Retry-After, never 429", () => {
    // A 429 from the Console API must only ever mean "you are going too
    // fast", which is about its own limits and not about Hue's.
    expect(ERRORS.BRIDGE_BUSY.httpStatus).toBe(503);
    expect(ERRORS.BRIDGE_BUSY.retryAfter).toBe(true);
    expect(ERRORS.TOO_MANY_REQUESTS.httpStatus).toBe(429);
  });

  it("answers a rejected Gateway Token with 500, never 401", () => {
    // A deployment fault: the Console API holds that token and a person at a
    // browser has nothing to do with it. A 401 would send them to a login
    // screen that cannot help them.
    expect(ERRORS.GATEWAY_MISCONFIGURED.httpStatus).toBe(500);
    expect(ERRORS.NOT_AUTHENTICATED.httpStatus).toBe(401);
  });
});

describe("the codes raised here rather than translated", () => {
  const local = [
    ["NOT_AUTHENTICATED", 401],
    ["CSRF_REJECTED", 403],
    ["TOO_MANY_REQUESTS", 429],
    ["INVALID_REQUEST", 400],
    ["COLOR_AND_TEMPERATURE_BOTH_SET", 400],
  ] as const;

  it.each(local)("answers %s with %i", (code, httpStatus) => {
    expect(ERRORS[code].httpStatus).toBe(httpStatus);
  });

  it("has a meaning written down for every code", () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].meaning.length).toBeGreaterThan(0);
    }
  });
});

describe("the error envelope", () => {
  const envelope = {
    error: {
      code: "LIGHT_NOT_FOUND",
      message: "no light with that id",
      detail: "resource 0ec23e3a not found on the bridge",
      correlationId: "01JB2S0Z3M0000000000000000",
    },
  };

  it("carries a code, a message, a detail and a Correlation ID", () => {
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("takes an envelope with nothing to add in detail", () => {
    const { detail: _none, ...rest } = envelope.error;

    expect(errorEnvelopeSchema.safeParse({ error: rest }).success).toBe(true);
  });

  it("refuses a code that is not one of ours", () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: { ...envelope.error, code: "SOMETHING_WENT_WRONG" },
      }).success,
    ).toBe(false);
  });

  it("refuses an envelope with no Correlation ID", () => {
    // It is the one thing that ties what a person saw to what was logged.
    const { correlationId: _none, ...rest } = envelope.error;

    expect(errorEnvelopeSchema.safeParse({ error: rest }).success).toBe(false);
  });
});
