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
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { meterMutations, MUTATIONS_PER_MINUTE } from "./meter.js";

const CORRELATION_ID = "11111111-2222-3333-4444-555555555555";

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
    meter: meterMutations(),
    sessionOf: () => "a-session",
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

/** A PATCH with a JSON body, which is how every Command arrives. */
function patch(
  at: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(at, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("reading the Lights", () => {
  it("answers with what the Gateway said, under its own id", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
    expect(await response.json()).toEqual([aLight()]);
  });

  it("reports a failure as the code the table gives it", async () => {
    const at = await serving({
      gateway: aGateway({
        listLights: async () =>
          refused("GATEWAY_NOT_PAIRED", "press the link button"),
      }),
    });

    const response = await fetch(`${at}/api/v1/lights`);

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
    const at = await serving({
      gateway: aGateway({ listLights: async () => refused("BRIDGE_BUSY") }),
    });

    const response = await fetch(`${at}/api/v1/lights`);

    expect(response.status).toBe(503);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("sends none with the codes that cannot be waited out", async () => {
    const at = await serving({
      gateway: aGateway({
        listLights: async () => refused("BRIDGE_UNREACHABLE"),
      }),
    });

    const response = await fetch(`${at}/api/v1/lights`);

    expect(response.headers.get("retry-after")).toBeNull();
  });
});

describe("reading one Light", () => {
  it("asks for the id in the path", async () => {
    const gateway = aGateway();
    const at = await serving({ gateway });

    const response = await fetch(`${at}/api/v1/lights/bedroom-2`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "bedroom-2" });
  });

  it("answers 404 for a Light the Bridge does not know", async () => {
    const at = await serving({
      gateway: aGateway({ getLight: async () => refused("LIGHT_NOT_FOUND") }),
    });

    const response = await fetch(`${at}/api/v1/lights/nobody`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "LIGHT_NOT_FOUND" },
    });
  });
});

describe("changing a Light", () => {
  it("answers with an Acknowledgement and never with a Light", async () => {
    const at = await serving();

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, {
      on: true,
    });
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
    const at = await serving({ gateway });

    await patch(`${at}/api/v1/lights/kitchen-1`, {
      on: false,
      brightness: 0,
    });

    // `false` and `0` are what the body said, and both survive: the difference
    // between a key that is absent and a key that is falsey is the whole
    // contract of a Command.
    expect(gateway.commands).toEqual([
      { id: "kitchen-1", command: { on: false, brightness: 0 } },
    ]);
  });

  it("reports an Outcome the Bridge refused as a 200", async () => {
    const at = await serving({
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

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });

    // The request was well formed and the Gateway answered it. `outcome` is
    // where a refusal is reported, and a 4xx here would be the Console API
    // claiming the browser did something wrong.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "rejected" });
  });

  it("reports one that ran out of time as unknown, never failed", async () => {
    const at = await serving({
      gateway: aGateway({
        updateLight: async () => refused("MUTATION_OUTCOME_UNKNOWN"),
      }),
    });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });
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
    const at = await serving({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, {
      colorXy: { x: 0.4, y: 0.4 },
      colorTemperatureMirek: 366,
    });

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
    const at = await serving({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, body);
    const { error } = await envelopeOf(response);

    expect(response.status).toBe(400);
    expect(error.code).toBe("INVALID_REQUEST");
    // The refusal says what was wrong with it, in the Console API's words.
    expect(error.detail).toBeTruthy();
    expect(gateway.calls).toBe(0);
  });

  it("is refused when the body is not JSON at all", async () => {
    const gateway = aGateway();
    const at = await serving({ gateway });

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, "{oh no");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(gateway.calls).toBe(0);
  });

  it("is refused when the body is larger than the edge will read", async () => {
    const gateway = aGateway();
    const at = await serving({ gateway });

    // Well past 8KB, and valid JSON: what is being refused is the size, not
    // the shape, and the body is never parsed to find that out. The detail is
    // what says which of the two happened — an oversized body and a body full
    // of keys nobody knows are both `INVALID_REQUEST`, and only one of them
    // was refused without being read.
    const response = await patch(`${at}/api/v1/lights/kitchen-1`, {
      on: true,
      padding: "x".repeat(16_384),
    });
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
    const at = await serving({ gateway });

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      const allowed = await patch(`${at}/api/v1/lights/kitchen-1`, {
        on: true,
      });
      expect(allowed.status, `mutation ${sent + 1}`).toBe(200);
    }

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({
      error: { code: "TOO_MANY_REQUESTS" },
    });
    // Refused here, so the Bridge never hears about it.
    expect(gateway.calls).toBe(MUTATIONS_PER_MINUTE);
  });

  it("counts one session's Mutations against that session alone", async () => {
    let who = "one";
    const at = await serving({ sessionOf: () => who });

    for (let sent = 0; sent < MUTATIONS_PER_MINUTE; sent += 1) {
      await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });
    }
    who = "another";

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, { on: true });

    expect(response.status).toBe(200);
  });

  it("does not meter reads", async () => {
    const at = await serving();

    for (let read = 0; read < MUTATIONS_PER_MINUTE * 2; read += 1) {
      const response = await fetch(`${at}/api/v1/lights`);
      expect(response.status, `read ${read + 1}`).toBe(200);
    }
  });
});

describe("the Correlation ID", () => {
  it("is the one the Gateway was asked under, so there is one id", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`);

    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
  });

  it("is minted here when nothing reached the Gateway", async () => {
    const at = await serving();

    const response = await patch(`${at}/api/v1/lights/kitchen-1`, {});
    const { error } = await envelopeOf(response);

    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-correlation-id")).toBe(error.correlationId);
  });

  it("is never the one the browser asked for", async () => {
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`, {
      headers: { "x-correlation-id": "a-browser-made-this-up" },
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
    expect(await response.json()).toEqual({ status: "ok" });
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
    const at = await serving();

    const response = await fetch(`${at}/api/v1/lights`, { method: "DELETE" });

    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });
});
