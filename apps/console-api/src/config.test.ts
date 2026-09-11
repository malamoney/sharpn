/**
 * What the process reads out of its environment before it starts.
 *
 * Every case here is a deployment fault or the absence of one, which is why
 * they are worth a test: the difference between a process that refuses to
 * start and one that starts and answers every request with a 500 is the
 * difference between a deploy that fails and a house whose lights stopped
 * working.
 */
import { describe, expect, it } from "vitest";

import { settingsFrom } from "./config.js";

const ENOUGH = { GATEWAY_TARGET: "hue.local:50051" };

describe("the settings", () => {
  it("need only where the Gateway is", () => {
    expect(settingsFrom(ENOUGH)).toEqual({
      port: 3000,
      gateway: {
        target: "hue.local:50051",
        certificateFile: "/run/secrets/gateway-certificate",
        tokenFile: "/run/secrets/gateway-token",
      },
      version: { sha: "unknown", proto: "unknown" },
    });
  });

  it("take the secrets and the port from wherever they are put", () => {
    expect(
      settingsFrom({
        ...ENOUGH,
        PORT: "8080",
        GATEWAY_CERTIFICATE_FILE: "/tmp/cert.pem",
        GATEWAY_TOKEN_FILE: "/tmp/token",
      }),
    ).toMatchObject({
      port: 8080,
      gateway: {
        certificateFile: "/tmp/cert.pem",
        tokenFile: "/tmp/token",
      },
    });
  });

  it("carry the stamps a build put on, when it put any on", () => {
    expect(
      settingsFrom({
        ...ENOUGH,
        GIT_SHA: "b26224d",
        PROTO_REVISION: "e3bef6b",
      }),
    ).toMatchObject({ version: { sha: "b26224d", proto: "e3bef6b" } });
  });

  it("refuse to start without somewhere to find the Gateway", () => {
    // Named in the message, because the person reading it is looking at a
    // container that will not come up and has one thing to fix.
    expect(() => settingsFrom({})).toThrow(/GATEWAY_TARGET/);
  });

  it("refuse a port that is not one", () => {
    expect(() => settingsFrom({ ...ENOUGH, PORT: "3000; rm -rf /" })).toThrow(
      /PORT/,
    );
    expect(() => settingsFrom({ ...ENOUGH, PORT: "0" })).toThrow(/PORT/);
    expect(() => settingsFrom({ ...ENOUGH, PORT: "70000" })).toThrow(/PORT/);
  });
});
