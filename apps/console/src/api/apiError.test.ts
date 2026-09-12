import { describe, expect, it } from "vitest";

import { ApiError, classifyOutage, messageForOutage } from "./apiError.js";

describe("classifying an outage", () => {
  it("calls a fetch that never reached the Console API console-api-unreachable", () => {
    expect(classifyOutage(new TypeError("Failed to fetch"))).toEqual({
      kind: "console_api_unreachable",
    });
  });

  it("calls GATEWAY_UNREACHABLE and GATEWAY_NOT_PAIRED gateway_unreachable", () => {
    const error = new ApiError({
      code: "GATEWAY_UNREACHABLE",
      message: "This service could not reach the Gateway at all.",
      correlationId: "c1",
    });

    expect(classifyOutage(error)).toEqual({
      kind: "gateway_unreachable",
      error,
    });
  });

  it("calls BRIDGE_UNREACHABLE and GATEWAY_NOT_PAIRED bridge_unreachable", () => {
    const unreachable = new ApiError({
      code: "BRIDGE_UNREACHABLE",
      message: "The Gateway could not reach the Bridge.",
      correlationId: "c2",
    });
    const notPaired = new ApiError({
      code: "GATEWAY_NOT_PAIRED",
      message: "The Gateway is not paired with a Bridge.",
      correlationId: "c3",
    });

    expect(classifyOutage(unreachable)).toEqual({
      kind: "bridge_unreachable",
      error: unreachable,
    });
    expect(classifyOutage(notPaired)).toEqual({
      kind: "bridge_unreachable",
      error: notPaired,
    });
  });

  it("calls anything else other, carrying the ApiError to show verbatim", () => {
    const error = new ApiError({
      code: "LIGHT_NOT_FOUND",
      message: "There is no light with that id.",
      correlationId: "c4",
    });

    expect(classifyOutage(error)).toEqual({ kind: "other", error });
  });

  it("calls a non-ApiError, non-network failure other with no ApiError to show", () => {
    expect(classifyOutage(new Error("something this did not anticipate"))).toEqual({
      kind: "other",
      error: undefined,
    });
  });
});

describe("the message shown for an outage", () => {
  it("names the Console API for console_api_unreachable", () => {
    expect(messageForOutage({ kind: "console_api_unreachable" })).toMatch(
      /console api/i,
    );
  });

  it("names the Gateway for gateway_unreachable", () => {
    const error = new ApiError({
      code: "GATEWAY_UNREACHABLE",
      message: "This service could not reach the Gateway at all.",
      correlationId: "c1",
    });

    expect(messageForOutage({ kind: "gateway_unreachable", error })).toMatch(
      /gateway/i,
    );
  });

  it("carries the Gateway's own instructions for bridge_unreachable when there are any", () => {
    const error = new ApiError({
      code: "GATEWAY_NOT_PAIRED",
      message: "The Gateway is not paired with a Bridge.",
      detail: "press the link button on the Bridge",
      correlationId: "c2",
    });

    expect(messageForOutage({ kind: "bridge_unreachable", error })).toBe(
      "press the link button on the Bridge",
    );
  });
});
