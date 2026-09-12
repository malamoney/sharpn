import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./apiError.js";
import { get, onUnauthenticated, patch } from "./client.js";
import type { ErrorEnvelope, Light } from "./types.js";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a successful request", () => {
  it("parses the JSON body", async () => {
    const light: Light = {
      id: "l1",
      name: "Hallway",
      archetype: "classic_bulb",
      on: true,
      capabilities: { dimming: false, colorTemperature: false, color: false },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(light)));

    await expect(get<Light>("/lights/l1")).resolves.toEqual(light);
  });

  it("treats a 204 as no body, not as a JSON parse of nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(patch("/lights/l1", { on: true })).resolves.toBeUndefined();
  });
});

describe("a refusal in the error envelope", () => {
  it("becomes an ApiError carrying the envelope's fields", async () => {
    const envelope: ErrorEnvelope = {
      error: {
        code: "LIGHT_NOT_FOUND",
        message: "There is no light with that id.",
        correlationId: "corr-1",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(envelope, {
          status: 404,
          headers: { "x-correlation-id": "corr-1" },
        }),
      ),
    );

    await expect(get("/lights/missing")).rejects.toMatchObject({
      code: "LIGHT_NOT_FOUND",
      correlationId: "corr-1",
    });
  });

  it("carries Retry-After when the response sent one", async () => {
    const envelope: ErrorEnvelope = {
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "That is more changes than this service will pass on in a minute.",
        correlationId: "corr-2",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(envelope, {
          status: 429,
          headers: { "retry-after": "3" },
        }),
      ),
    );

    await expect(patch("/lights/l1", { on: true })).rejects.toMatchObject({
      retryAfterSeconds: 3,
    });
  });

  it("notifies unauthenticated listeners on a 401, then still throws", async () => {
    const envelope: ErrorEnvelope = {
      error: {
        code: "NOT_AUTHENTICATED",
        message: "You are not signed in.",
        correlationId: "corr-3",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope, { status: 401 })),
    );

    const listener = vi.fn();
    const unlisten = onUnauthenticated(listener);

    await expect(get("/lights")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();

    unlisten();
  });
});

describe("a failure with no envelope to read", () => {
  it("becomes a GATEWAY_ERROR carrying the HTTP status as detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(get("/lights")).rejects.toMatchObject({
      code: "GATEWAY_ERROR",
      detail: expect.stringContaining("502"),
    });
  });
});

describe("a fetch that never reached the Console API", () => {
  it("propagates the TypeError fetch itself throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(get("/lights")).rejects.toBeInstanceOf(TypeError);
  });
});
