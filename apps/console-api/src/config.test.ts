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

import { SESSION_DURATION_MS } from "./auth/session.js";
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
      auth: {
        passwordHashFile: "/run/secrets/password-hash",
        sessionSecretFile: "/run/secrets/session-secret",
        sessionDurationMs: SESSION_DURATION_MS,
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
        PASSWORD_HASH_FILE: "/tmp/password-hash",
        SESSION_SECRET_FILE: "/tmp/session-secret",
      }),
    ).toMatchObject({
      port: 8080,
      gateway: {
        certificateFile: "/tmp/cert.pem",
        tokenFile: "/tmp/token",
      },
      auth: {
        passwordHashFile: "/tmp/password-hash",
        sessionSecretFile: "/tmp/session-secret",
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

  it("take a session duration from the environment, when told one", () => {
    // The seam an e2e run uses to watch a real session actually expire,
    // rather than waiting thirty days for it: auth/session.ts's durationMs.
    expect(
      settingsFrom({ ...ENOUGH, SESSION_DURATION_MS: "5000" }),
    ).toMatchObject({ auth: { sessionDurationMs: 5_000 } });
  });

  it("refuse a session duration that is not one", () => {
    expect(() =>
      settingsFrom({ ...ENOUGH, SESSION_DURATION_MS: "soon" }),
    ).toThrow(/SESSION_DURATION_MS/);
    expect(() =>
      settingsFrom({ ...ENOUGH, SESSION_DURATION_MS: "0" }),
    ).toThrow(/SESSION_DURATION_MS/);
  });
});
