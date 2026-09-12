/**
 * What the process is told before it starts, and what it refuses to start
 * without.
 *
 * Read once, at startup, and every fault in it is fatal. A Console API that
 * starts without knowing where the Gateway is would answer every request with
 * a 502 and look, from the outside, exactly like a Gateway that is down — so
 * the deploy that was wrong would present as an outage somewhere else.
 *
 * The secrets are paths rather than values, for the reason `credentials.ts`
 * gives: a token in an environment variable is a token in `docker inspect`, in
 * a crash dump, in a process listing and in every child process.
 */
import { SESSION_DURATION_MS } from "./auth/session.js";
import type { GatewayConfig } from "./gateway/index.js";
import type { Version } from "./version.js";

/** Where a compose secret is mounted, which is where both of these live. */
const SECRETS = "/run/secrets";

/** Where the password hash and the session-signing secret live. */
export interface AuthConfig {
  passwordHashFile: string;
  sessionSecretFile: string;
  /**
   * How long a session lasts since it was last used.
   *
   * `SESSION_DURATION_MS`'s default of thirty days, unless overridden — the
   * real deployment never sets this. The one thing that does is the e2e
   * Compose stack (docker-compose.e2e.yml), so a Playwright test can watch a
   * session actually expire in test time rather than waiting thirty days.
   */
  sessionDurationMs: number;
}

/** Everything `server.ts` needs to start. */
export interface Settings {
  port: number;
  gateway: GatewayConfig;
  auth: AuthConfig;
  version: Version;
}

export function settingsFrom(
  env: Record<string, string | undefined>,
): Settings {
  return {
    port: portFrom(env["PORT"]),
    gateway: {
      target: required(env, "GATEWAY_TARGET"),
      certificateFile:
        env["GATEWAY_CERTIFICATE_FILE"] ?? `${SECRETS}/gateway-certificate`,
      tokenFile: env["GATEWAY_TOKEN_FILE"] ?? `${SECRETS}/gateway-token`,
    },
    auth: {
      passwordHashFile: env["PASSWORD_HASH_FILE"] ?? `${SECRETS}/password-hash`,
      sessionSecretFile:
        env["SESSION_SECRET_FILE"] ?? `${SECRETS}/session-secret`,
      sessionDurationMs: sessionDurationMsFrom(env["SESSION_DURATION_MS"]),
    },
    version: {
      // Not fatal when absent, and not pretended about either. A build that
      // was not stamped has no SHA to report, and `unknown` is the true answer
      // to "which version is running" for one — which is itself worth seeing
      // on a machine that is meant to be running a release.
      sha: env["GIT_SHA"] ?? "unknown",
      proto: env["PROTO_REVISION"] ?? "unknown",
    },
  };
}

function required(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set, and there is no sensible default for it`,
    );
  }

  return value;
}

/**
 * The port, or a refusal to start.
 *
 * Parsed strictly rather than with `Number.parseInt`, which reads `3000; rm
 * -rf /` as 3000 and would have a process listening somewhere nobody meant
 * while the rest of the value went unmentioned.
 */
function portFrom(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT is ${JSON.stringify(value)}, which is not a port`);
  }

  return port;
}

/** The session duration, or the default of `SESSION_DURATION_MS`. */
function sessionDurationMsFrom(value: string | undefined): number {
  if (value === undefined) {
    return SESSION_DURATION_MS;
  }

  const durationMs = Number(value);
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error(
      `SESSION_DURATION_MS is ${JSON.stringify(value)}, which is not a duration in milliseconds`,
    );
  }

  return durationMs;
}
