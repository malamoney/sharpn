/**
 * The routes, over real HTTP, against a Gateway that is a stand-in.
 *
 * Real HTTP because most of what is worth asserting here is HTTP: which status
 * a code is sent with, which headers ride along, what an 8KB limit does to a
 * body, what a request with no content type parses to. A helper that called a
 * handler directly would assert none of it.
 *
 * The Gateway is a stand-in rather than the fake gRPC server `adapter.test.ts`
 * runs, because that file already proves what a status becomes; what this one
 * has to prove is what the routes do with the answer. The two together are the
 * whole path, and neither repeats the other.
 *
 * The password check is a stand-in too, for the same reason: `password.test.ts`
 * already proves this reads a real argon2id hash, and what is worth asking
 * here is what a route does with a match or a mismatch. The signed cookie is
 * not stood in for — it is cheap, real logic, and `session.test.ts` already
 * covers its arithmetic in isolation, so using the real thing here proves the
 * wiring rather than repeating either test.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionsSignedWith } from "../auth/session.js";
import {
  errorEnvelopeSchema,
  type Acknowledgement,
  type ErrorCode,
  type ErrorEnvelope,
  type Light,
  type LightCommand,
} from "../contract/index.js";
import type { Gateway, GatewayResult, Subscriber } from "../gateway/index.js";
import { consoleApi, type ConsoleApiParts } from "./app.js";
import { LOGIN_ATTEMPTS_PER_MINUTE, meterAtMost, MUTATIONS_PER_MINUTE } from "./meter.js";

const CORRELATION_ID = "11111111-2222-3333-4444-555555555555";
const TEST_PASSWORD = "the-shared-password";
const TEST_SESSION_SECRET = "a-session-signing-secret";

/** A Light as the adapter hands one up: already flat, already renamed. */
function aLight(overrides: Partial<Light> = {}): Light {
  return {
    id: "kitchen-1",
    name: "Hallway",
    archetype: "classic_bulb",
    on: true,
    brightness: 62.5,
    colorTemperatureMirek: 366,
    colorXy: { x: 0.4578, y: 0.4101 },
    capabilities: { dimming: true, colorTemperature: true, color: true },
    ...overrides,
  };
}

function anAcknowledgement(
  overrides: Partial<Acknowledgement> = {},
): Acknowledgement {
  return {
    outcome: "success",
    updated: [{ rid: "kitchen-1", rtype: "light" }],
    errors: [],
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function ok<T>(value: T): GatewayResult<T> {
  return { ok: true, correlationId: CORRELATION_ID, value };
}

function refused<T>(code: ErrorCode, detail?: string): GatewayResult<T> {
  return { ok: false, correlationId: CORRELATION_ID, code, detail };
}

/** Everything the routes can ask of a Gateway, and what they did ask. */
interface StandIn extends Gateway {
  commands: { id: string; command: LightCommand }[];
  calls: number;
}

function aGateway(answers: Partial<Gateway> = {}): StandIn {
  const commands: StandIn["commands"] = [];
  let calls = 0;

  return {
    async listLights() {
      calls += 1;
      return answers.listLights?.() ?? ok([aLight()]);
    },
    async getLight(id) {
      calls += 1;
      return answers.getLight?.(id) ?? ok(aLight({ id }));
    },
    async updateLight(id, command) {
      calls += 1;
      commands.push({ id, command });
      return answers.updateLight?.(id, command) ?? ok(anAcknowledgement());
    },
    subscribe(subscriber: Subscriber) {
      return answers.subscribe?.(subscriber) ?? { cancel: () => undefined };
    },
    isChannelReady() {
      return answers.isChannelReady?.() ?? true;
    },
    close() {
      answers.close?.();
    },
    get commands() {
      return commands;
    },
    get calls() {
      return calls;
    },
  };
}

/** A clock that starts at a round number and only moves when told to. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000_000;

  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

const running: Server[] = [];

afterEach(() => {
  for (const server of running.splice(0)) {
    server.close();
  }
  vi.restoreAllMocks();
});

/** The app on a port the operating system picked, and where to reach it. */
async function serving(parts: Partial<ConsoleApiParts> = {}): Promise<string> {
  const app = consoleApi({
    gateway: aGateway(),
    readiness: { channelConnected: () => true, subscribed: () => true },
    version: { sha: "0000000", proto: "e3bef6b" },
    meter: meterAtMost(MUTATIONS_PER_MINUTE),
    sessions: sessionsSignedWith(TEST_SESSION_SECRET),
    passwords: { matches: async (candidate) => candidate === TEST_PASSWORD },
    loginMeter: meterAtMost(LOGIN_ATTEMPTS_PER_MINUTE),
    ...parts,
  });

  const server = createServer(app);
  running.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/**
 * A failure's body, read as the envelope the contract says every one arrives
 * in. Parsing rather than casting: a route answering a shape of its own would
 * fail here rather than in whichever browser met it first.
 */
async function envelopeOf(response: Response): Promise<ErrorEnvelope> {
  return errorEnvelopeSchema.parse(await response.json());
}

/** The origin a same-origin browser would send for a request to `url`. */
function originOf(url: string): string {
  return new URL(url).origin;
}

/**
 * A mutation with a JSON body, sent with the Origin a same-origin browser
 * would send — real `fetch` does not compute one the way a browser does, so
 * every mutating helper below sets it explicitly, and the CSRF tests are the
 * ones that override or omit it on purpose.
 */
function patch(
  at: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(at, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: originOf(at),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function postSession(
  at: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${at}/api/v1/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: originOf(at),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteSession(at: string, headers: Record<string, string> = {}) {
  return fetch(`${at}/api/v1/session`, {
    method: "DELETE",
    headers: { origin: originOf(at), ...headers },
  });
}

/** The `name=value` half of a `Set-Cookie`, ready to send back as `Cookie`. */
function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("the response set no cookie");
  }

  return setCookie.split(";")[0] ?? "";
}

/** Signs in with the one shared password and returns the cookie it set. */
async function signedIn(at: string): Promise<string> {
  const response = await postSession(at, { password: TEST_PASSWORD });
  if (response.status !== 204) {
    throw new Error(`sign-in answered ${response.status}, not 204`);
  }

  return cookieFrom(response);
}

/** A server, already signed in, and the cookie that proves it. */
async function servingSignedIn(
  parts: Partial<ConsoleApiParts> = {},
): Promise<{ at: string; cookie: string }> {
  const at = await serving(parts);
  const cookie = await signedIn(at);
  return { at, cookie };
}

describe("reading the Lights", () => {
  it("answers with what the Gateway said, under its own id", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
    expect(await response.json()).toEqual([aLight()]);
  });

  it("reports a failure as the code the table gives it", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({
        listLights: async () =>
          refused("GATEWAY_NOT_PAIRED", "press the link button"),
      }),
    });

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(503);
    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
    expect(await response.json()).toMatchObject({
      error: {
        code: "GATEWAY_NOT_PAIRED",
        // Whoever refused, verbatim, beside the Console API's own words.
        detail: "press the link button",
        correlationId: CORRELATION_ID,
      },
    });
  });

  it("sends a Retry-After with the codes said to carry one", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({ listLights: async () => refused("BRIDGE_BUSY") }),
    });

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(503);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("sends none with the codes that cannot be waited out", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({
        listLights: async () => refused("BRIDGE_UNREACHABLE"),
      }),
    });

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.headers.get("retry-after")).toBeNull();
  });
});

describe("reading one Light", () => {
  it("asks for the id in the path", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await fetch(`${at}/api/v1/lights/bedroom-2`, {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "bedroom-2" });
  });

  it("answers 404 for a Light the Bridge does not know", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({ getLight: async () => refused("LIGHT_NOT_FOUND") }),
    });

    const response = await fetch(`${at}/api/v1/lights/nobody`, {
      headers: { cookie },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "LIGHT_NOT_FOUND" },
    });
  });
});

describe("changing a Light", () => {
  it("answers with an Acknowledgement and never with a Light", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(anAcknowledgement());
    // ADR 0001. A Light here would be state the Bridge never reported, and
    // nothing in the shape would say so.
    expect(body).not.toHaveProperty("brightness");
    expect(body).not.toHaveProperty("on");
  });

  it("sends the Command the body carried, keys and all", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: false, brightness: 0 },
      { cookie },
    );

    // `false` and `0` are what the body said, and both survive: the difference
    // between a key that is absent and a key that is falsey is the whole
    // contract of a Command.
    expect(gateway.commands).toEqual([
      { id: "kitchen-1", command: { on: false, brightness: 0 } },
    ]);
  });

  it("reports an Outcome the Bridge refused as a 200", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({
        updateLight: async () =>
          ok(
            anAcknowledgement({
              outcome: "rejected",
              updated: [],
              errors: [
                { description: "device (light) has communication issues" },
              ],
            }),
          ),
      }),
    });

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie },
    );

    // The request was well formed and the Gateway answered it. `outcome` is
    // where a refusal is reported, and a 4xx here would be the Console API
    // claiming the browser did something wrong.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "rejected" });
  });

  it("reports one that ran out of time as unknown, never failed", async () => {
    const { at, cookie } = await servingSignedIn({
      gateway: aGateway({
        updateLight: async () => refused("MUTATION_OUTCOME_UNKNOWN"),
      }),
    });

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie },
    );
    const { error } = await envelopeOf(response);

    expect(response.status).toBe(504);
    expect(error.code).toBe("MUTATION_OUTCOME_UNKNOWN");
    // The one thing this answer may not say. The Command may well have been
    // applied and the reply lost, and a person told it failed will send it
    // again.
    expect(error.message).not.toMatch(/fail/i);
  });
});

describe("a Command that never leaves", () => {
  it("is refused when it sets a colour and a temperature at once", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { colorXy: { x: 0.4, y: 0.4 }, colorTemperatureMirek: 366 },
      { cookie },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "COLOR_AND_TEMPERATURE_BOTH_SET" },
    });
    // The whole point of the guard: the message is a oneof, so one of the two
    // would have been silently discarded and the other applied.
    expect(gateway.calls).toBe(0);
  });

  it.each([
    ["asks for no change", {}],
    ["carries a key nobody knows", { brightnes: 50 }],
    ["carries a null, which is neither present nor absent", { on: null }],
    ["is out of the range the Bridge accepts", { brightness: 101 }],
    ["is out of the mirek range", { colorTemperatureMirek: 42 }],
    ["is not an object at all", [1, 2, 3]],
  ])("is refused when it %s", async (_what, body) => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, body, {
      cookie,
    });
    const { error } = await envelopeOf(response);

    expect(response.status).toBe(400);
    expect(error.code).toBe("INVALID_REQUEST");
    // The refusal says what was wrong with it, in the Console API's words.
    expect(error.detail).toBeTruthy();
    expect(gateway.calls).toBe(0);
  });

  it("is refused when the body is not JSON at all", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, "{oh no", {
      cookie,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(gateway.calls).toBe(0);
  });

  it("is refused when the body is larger than the edge will read", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    // Well past 8KB, and valid JSON: what is being refused is the size, not
    // the shape, and the body is never parsed to find that out. The detail is
    // what says which of the two happened — an oversized body and a body full
    // of keys nobody knows are both `INVALID_REQUEST`, and only one of them
    // was refused without being read.
    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true, padding: "x".repeat(16_384) },
      { cookie },
    );
    const { error } = await envelopeOf(response);

    expect(response.status).toBe(400);
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.detail).toContain("8kb");
    expect(gateway.calls).toBe(0);
  });
});

describe("how fast a session may change things", () => {
  it("refuses past a minute's worth, and says how long to wait", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      const allowed = await patch(
        `${at}/api/v1/lights/kitchen-1`,
        { on: true },
        { cookie },
      );
      expect(allowed.status, `mutation ${sent + 1}`).toBe(200);
    }

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie },
    );

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({
      error: { code: "TOO_MANY_REQUESTS" },
    });
    // Refused here, so the Bridge never hears about it.
    expect(gateway.calls).toBe(MUTATIONS_PER_MINUTE);
  });

  it("counts one session's Mutations against that session alone", async () => {
    const at = await serving();
    const one = await signedIn(at);
    const another = await signedIn(at);

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      await patch(`${at}/api/v1/lights/kitchen-1`, { on: true }, { cookie: one });
    }

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie: another },
    );

    expect(response.status).toBe(200);
  });

  it("counts a body it would not even read", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      const answer = await patch(`${at}/api/v1/lights/kitchen-1`, "{oh no", {
        cookie,
      });
      expect(answer.status, `mutation ${sent + 1}`).toBe(400);
    }

    // A session sending nonsense as fast as it can is what the meter is for as
    // much as one sending Commands. A limit that only counted the bodies that
    // parsed would be a limit on being well behaved.
    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie },
    );

    expect(response.status).toBe(429);
    expect(gateway.calls).toBe(0);
  });

  it("does not meter reads", async () => {
    const { at, cookie } = await servingSignedIn();

    for (let read = 0; read < MUTATIONS_PER_MINUTE * 2; read += 1) {
      const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });
      expect(response.status, `read ${read + 1}`).toBe(200);
    }
  });
});

describe("signing in", () => {
  it("sets a cookie a Light route will accept", async () => {
    const at = await serving();

    const cookie = await signedIn(at);
    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(200);
  });

  it("sets the cookie with the flags a session must carry", async () => {
    const at = await serving();

    const response = await postSession(at, { password: TEST_PASSWORD });
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(setCookie).toMatch(/^sharpn_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    // Thirty days, in seconds.
    expect(setCookie).toMatch(/Max-Age=2592000/);
  });

  it("refuses a password that does not match, as not-signed-in", async () => {
    const at = await serving();

    const response = await postSession(at, { password: "a-guess" });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_AUTHENTICATED" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a body that is not a login at all", async () => {
    const at = await serving();

    const response = await postSession(at, { password: 7 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("refuses past the ceiling on attempts, and says how long to wait", async () => {
    const at = await serving();

    for (let sent = 0; sent < LOGIN_ATTEMPTS_PER_MINUTE; sent += 1) {
      const attempt = await postSession(at, { password: "a-guess" });
      expect(attempt.status, `attempt ${sent + 1}`).toBe(401);
    }

    // Even the right password is refused once the ceiling is spent: this
    // bounds how fast a password can be guessed at all, not how fast a wrong
    // one can be.
    const response = await postSession(at, { password: TEST_PASSWORD });

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("counts an attempt whose body it would not even read", async () => {
    // The ceiling is mounted ahead of `express.json()` in `app.ts` for
    // exactly this: a body Express cannot parse never reaches the route, and
    // a guess that skipped the meter on that account would be a ceiling a
    // malformed request could always slip under.
    const at = await serving();

    for (let sent = 0; sent < LOGIN_ATTEMPTS_PER_MINUTE; sent += 1) {
      const attempt = await postSession(at, "{oh no");
      expect(attempt.status, `attempt ${sent + 1}`).toBe(400);
    }

    const response = await postSession(at, { password: TEST_PASSWORD });

    expect(response.status).toBe(429);
  });
});

describe("signing out", () => {
  it("clears the cookie", async () => {
    const at = await serving();

    const response = await deleteSession(at);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(204);
    expect(setCookie).toMatch(/^sharpn_session=;/);
    expect(setCookie).toMatch(/Max-Age=0/);
  });

  it("answers the same way whether or not there was a session", async () => {
    const { at, cookie } = await servingSignedIn();

    const withSession = await deleteSession(at, { cookie });
    const withoutOne = await deleteSession(at);

    expect(withSession.status).toBe(204);
    expect(withoutOne.status).toBe(204);
  });

  it("does not revoke the cookie itself: there is no session store to ask", async () => {
    // ADR 0006. One shared password has no per-session identity to revoke,
    // so signing out is the browser discarding a cookie this process never
    // remembered issuing. The cookie a person copied out before signing out
    // still verifies, which is the deliberate trade this design makes.
    const { at, cookie } = await servingSignedIn();

    await deleteSession(at, { cookie });
    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(200);
  });
});

describe("requiring a session", () => {
  it("refuses a read with no cookie at all", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_AUTHENTICATED" },
    });
  });

  it("refuses a Mutation with no cookie, before the meter or the Bridge see it", async () => {
    const gateway = aGateway();
    const at = await serving({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });

    expect(response.status).toBe(401);
    expect(gateway.calls).toBe(0);
  });

  it("refuses a cookie that does not verify", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`, {
      headers: { cookie: "sharpn_session=not-a-real-cookie" },
    });

    expect(response.status).toBe(401);
  });

  it("refuses a cookie signed with a different secret", async () => {
    const at = await serving();
    const elsewhere = sessionsSignedWith("a-different-secret");
    const { value } = elsewhere.mint();

    const response = await fetch(`${at}/api/v1/lights`, {
      headers: { cookie: `sharpn_session=${value}` },
    });

    expect(response.status).toBe(401);
  });

  it("refuses a cookie that has expired", async () => {
    const time = clock();
    const at = await serving({ sessions: sessionsSignedWith(TEST_SESSION_SECRET, time.now) });
    const cookie = await signedIn(at);

    time.advance(30 * 24 * 60 * 60 * 1000);

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(401);
  });

  it("reissues the cookie on every authenticated request", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.headers.get("set-cookie")).toMatch(/^sharpn_session=/);
  });

  it("slides the expiry forward, so a session kept in use outlives thirty days", async () => {
    const time = clock();
    const at = await serving({ sessions: sessionsSignedWith(TEST_SESSION_SECRET, time.now) });
    let cookie = await signedIn(at);

    // Two passes of twenty-nine days, asking again just inside each window.
    // Neither pass alone reaches thirty days; renewing on the first is the
    // only reason the second is still signed in.
    for (let pass = 0; pass < 2; pass += 1) {
      time.advance(29 * 24 * 60 * 60 * 1000);
      const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });
      expect(response.status, `pass ${pass + 1}`).toBe(200);
      cookie = cookieFrom(response);
    }
  });

  it("does not gate the routes a browser needs before it has a session", async () => {
    const at = await serving();

    const health = await fetch(`${at}/healthz`);
    const login = await postSession(at, { password: TEST_PASSWORD });

    expect(health.status).toBe(200);
    expect(login.status).toBe(204);
  });
});

describe("the CSRF guard", () => {
  it("refuses a Mutation with no Origin header at all", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await fetch(`${at}/api/v1/lights/kitchen-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ on: true }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CSRF_REJECTED" },
    });
    expect(gateway.calls).toBe(0);
  });

  it("refuses a Mutation whose Origin is some other site", async () => {
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie, origin: "https://attacker.example" },
    );

    expect(response.status).toBe(403);
    expect(gateway.calls).toBe(0);
  });

  it("checks the Origin before a session at all, on the same request", async () => {
    // Order is asserted, not just outcome: an unauthenticated forged request
    // and an authenticated forged request must fail the same way, so a
    // response's status never tells an attacker which half succeeded.
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights/kitchen-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on: true }),
    });

    expect(response.status).toBe(403);
  });

  it("does not check a read's Origin at all", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.status).toBe(200);
  });

  it("guards signing in and signing out too", async () => {
    const at = await serving();

    const login = await fetch(`${at}/api/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    const logout = await fetch(`${at}/api/v1/session`, { method: "DELETE" });

    expect(login.status).toBe(403);
    expect(logout.status).toBe(403);
  });

  it("accepts the same host under a different scheme than this request arrived on", async () => {
    // This process only ever sees plain HTTP in this test, and in a real
    // deployment too unless Nginx forwards `X-Forwarded-Proto` — which
    // nothing here can make it do. Comparing hosts rather than full origins
    // is what keeps a browser's `https://` Origin from being refused by a
    // guess at the scheme that never had to be right.
    const gateway = aGateway();
    const { at, cookie } = await servingSignedIn({ gateway });
    const host = new URL(at).host;

    const response = await patch(
      `${at}/api/v1/lights/kitchen-1`,
      { on: true },
      { cookie, origin: `https://${host}` },
    );

    expect(response.status).toBe(200);
    expect(gateway.calls).toBe(1);
  });
});

describe("the Correlation ID", () => {
  it("is the one the Gateway was asked under, so there is one id", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, { headers: { cookie } });

    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
  });

  it("is minted here when nothing reached the Gateway", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, {}, { cookie });
    const { error } = await envelopeOf(response);

    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-correlation-id")).toBe(error.correlationId);
  });

  it("is never the one the browser asked for", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, {
      headers: { cookie, "x-correlation-id": "a-browser-made-this-up" },
    });

    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
  });
});

describe("whether the process is alive", () => {
  it("says so without asking anything of the Gateway", async () => {
    const gateway = aGateway({
      listLights: async () => refused("GATEWAY_UNREACHABLE"),
    });
    const at = await serving({
      gateway,
      readiness: { channelConnected: () => false, subscribed: () => false },
    });

    const response = await fetch(`${at}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alive: true });
    expect(gateway.calls).toBe(0);
  });
});

describe("whether the process is ready to serve", () => {
  it("is ready when the channel is up and a subscription is held", async () => {
    const at = await serving({
      readiness: { channelConnected: () => true, subscribed: () => true },
    });

    const response = await fetch(`${at}/readyz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ready: true,
      channel: "connected",
      subscription: "established",
    });
  });

  it.each([
    [
      "the channel is down",
      { channelConnected: () => false, subscribed: () => true },
      { channel: "disconnected", subscription: "established" },
    ],
    [
      "no subscription is established",
      { channelConnected: () => true, subscribed: () => false },
      { channel: "connected", subscription: "lost" },
    ],
  ])("is not ready when %s, and says which", async (_what, readiness, said) => {
    const at = await serving({ readiness });

    const response = await fetch(`${at}/readyz`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false, ...said });
  });

  it("asserts nothing about the Bridge", async () => {
    // The Gateway's own health service reports SERVING from startup and says
    // nothing about a Bridge, and neither does this. A Bridge that is
    // unreachable is a 503 on a route, not a process that should be restarted.
    const gateway = aGateway({
      listLights: async () => refused("BRIDGE_UNREACHABLE"),
    });
    const at = await serving({ gateway });

    const response = await fetch(`${at}/readyz`);

    expect(response.status).toBe(200);
    expect(gateway.calls).toBe(0);
  });
});

describe("which version is running", () => {
  it("reports the checkout and the contract it was built from", async () => {
    // There is no registry, so the deployment artifact is a checkout (ADR
    // 0003) and these two are the only answer to "which version is running".
    const at = await serving({
      version: { sha: "b26224d", proto: "e3bef6b14545b08c" },
    });

    const response = await fetch(`${at}/version`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sha: "b26224d",
      proto: "e3bef6b14545b08c",
    });
  });
});

describe("a path nothing serves", () => {
  it("is answered in the same envelope as everything else", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/scenes`);

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("is answered that way for a method a route does not have", async () => {
    const { at, cookie } = await servingSignedIn();

    const response = await fetch(`${at}/api/v1/lights`, {
      method: "DELETE",
      headers: { cookie, origin: originOf(at) },
    });

    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });
});
