/**
 * The adapter, tested against a Gateway that is real enough to disagree.
 *
 * Every test here drives the adapter's public interface and observes a fake
 * Gateway on the other end of a real gRPC channel: real TLS with a pinned
 * certificate, real serialization, real statuses, real deadlines. Nothing
 * reaches inside for a codec or a translation table, because the things worth
 * asserting — which code a status becomes, what the Gateway actually receives
 * on the wire, how many RPCs two concurrent reads make — are only observable
 * from outside.
 *
 * The certificate is minted here rather than committed. A key in the
 * repository is a key somebody has to explain, and the one thing these tests
 * need it to be is trusted by exactly one client for exactly one name — which
 * is ADR 0004's arrangement, and is cheap to produce.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Server,
  ServerCredentials,
  status,
  type ServerErrorResponse,
  type ServerUnaryCall,
  type ServerWritableStream,
  type sendUnaryData,
} from "@grpc/grpc-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { LightGet } from "../gen/hue/v1/lighting.js";
import { Event_Type } from "../gen/hue/v1/events.js";
import {
  EventServiceService,
  Gap_Cause,
  type EventServiceServer,
  type HueEvent,
  type SubscribeRequest,
} from "../gen/hue/v1/event_service.js";
import {
  LightingServiceService,
  UpdateLightRequest,
  type LightingServiceServer,
  type GetLightRequest,
  type ListLightsRequest,
  type ListLightsResponse,
} from "../gen/hue/v1/lighting_service.js";
import type { MutationResponse } from "../gen/hue/v1/lighting_service.js";
import {
  LightArchetype,
  ResourceIdentifier_Rtype,
} from "../gen/hue/v1/common.js";
import type { LightCommand } from "../contract/index.js";
import {
  connectToGateway,
  UNARY_DEADLINE_MS,
  type Gateway,
  type GatewayConfig,
  type GatewayEvent,
  type GatewayResult,
} from "./index.js";

const TOKEN = "a-gateway-token";
const RTYPE_LIGHT = ResourceIdentifier_Rtype.RTYPE_LIGHT;

/** A `LightGet` as the Gateway reports one: a colour bulb, currently warm. */
function aLightGet(overrides: Partial<LightGet> = {}): LightGet {
  return {
    type: "light",
    id: "0ec23e3a-5e1b-4c3f-9a6b-1f2f4d0a7c11",
    owner: { rid: "d1", rtype: 1 },
    metadata: {
      name: "Hallway",
      archetype: LightArchetype.LIGHT_ARCHETYPE_CLASSIC_BULB,
      function: 1,
    },
    identify: {},
    serviceId: 0,
    on: { on: true },
    dimming: { brightness: 62.5 },
    colorTemperature: { mirek: 366, mirekValid: true },
    color: { xy: { x: 0.4578, y: 0.4101 } },
    mode: 1,
    ...overrides,
  };
}

interface Answers {
  listLights?: (
    call: ServerUnaryCall<ListLightsRequest, ListLightsResponse>,
    callback: sendUnaryData<ListLightsResponse>,
  ) => void;
  getLight?: (
    call: ServerUnaryCall<GetLightRequest, LightGet>,
    callback: sendUnaryData<LightGet>,
  ) => void;
  updateLight?: (
    call: ServerUnaryCall<UpdateLightRequest, MutationResponse>,
    callback: sendUnaryData<MutationResponse>,
  ) => void;
  subscribe?: (call: ServerWritableStream<SubscribeRequest, HueEvent>) => void;
}

let secrets: string;
let certificateFile: string;
let strangerCertificateFile: string;
let tokenFile: string;
let server: Server;
let target: string;
let answers: Answers;
let gateway: Gateway | undefined;
/** Every `UpdateLightRequest` the fake Gateway received, exactly as it arrived. */
let sent: Uint8Array[] = [];

beforeAll(async () => {
  secrets = mkdtempSync(join(tmpdir(), "sharpn-gateway-"));
  certificateFile = join(secrets, "gateway.pem");
  tokenFile = join(secrets, "gateway-token");
  const keyFile = join(secrets, "gateway-key.pem");

  // `-subj` and `-addext` rather than a config file, and stderr thrown away:
  // openssl writes its progress dots there, and a test run is not the place.
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      keyFile,
      "-out",
      certificateFile,
      "-days",
      "2",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  // A second certificate, for the same name, that nothing trusts. It is what
  // a Gateway presenting the wrong certificate looks like.
  strangerCertificateFile = join(secrets, "stranger.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      join(secrets, "stranger-key.pem"),
      "-out",
      strangerCertificateFile,
      "-days",
      "2",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );

  writeFileSync(tokenFile, `${TOKEN}\n`);

  server = new Server();
  // The update method is registered with a deserializer that keeps the bytes
  // it was given. Presence is the whole contract of a Command, and presence is
  // a property of the message on the wire — omitted, `false` and `0` are three
  // different encodings and only two of them are visible in a decoded object.
  const capturing: typeof LightingServiceService = {
    ...LightingServiceService,
    updateLight: {
      ...LightingServiceService.updateLight,
      requestDeserialize: (bytes: Buffer) => {
        sent.push(Uint8Array.from(bytes));

        return LightingServiceService.updateLight.requestDeserialize(bytes);
      },
    },
  };

  const lightingService: LightingServiceServer = {
    listLights: (call, callback) => answers.listLights?.(call, callback),
    getLight: (call, callback) => answers.getLight?.(call, callback),
    updateLight: (call, callback) => answers.updateLight?.(call, callback),
  };
  server.addService(capturing, lightingService);

  const eventService: EventServiceServer = {
    subscribe: (call) => answers.subscribe?.(call),
  };
  server.addService(EventServiceService, eventService);

  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync(
      "localhost:0",
      ServerCredentials.createSsl(
        null,
        [
          {
            private_key: readFileSync(keyFile),
            cert_chain: readFileSync(certificateFile),
          },
        ],
        false,
      ),
      (error, bound) => (error ? reject(error) : resolve(bound)),
    );
  });
  // The certificate is issued for a name rather than for an address, which is
  // the arrangement ADR 0004 describes: the Console API resolves a name its
  // container is told about, and verifies the certificate against that name.
  target = `localhost:${port}`;
});

afterAll(() => {
  server.forceShutdown();
});

afterEach(() => {
  gateway?.close();
  gateway = undefined;
  sent = [];
});

/** The adapter, dialling the fake Gateway with the certificate it pinned. */
function connect(overrides: Partial<GatewayConfig> = {}): Gateway {
  gateway = connectToGateway({
    target,
    certificateFile,
    tokenFile,
    ...overrides,
  });

  return gateway;
}

/** A status, sent the way the Gateway sends one. */
function refuse(code: status, details: string) {
  return (_call: unknown, callback: (error: ServerErrorResponse) => void) =>
    callback({ code, details, name: "Error", message: details });
}

describe("reading the Lights", () => {
  it("answers with Lights, not with what the Gateway reported", async () => {
    answers = {
      listLights: (_call, callback) =>
        callback(null, { lights: [aLightGet()] }),
    };

    const result = await connect().listLights();

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          id: "0ec23e3a-5e1b-4c3f-9a6b-1f2f4d0a7c11",
          name: "Hallway",
          archetype: "classic_bulb",
          on: true,
          brightness: 62.5,
          colorTemperatureMirek: 366,
          colorXy: { x: 0.4578, y: 0.4101 },
          capabilities: { dimming: true, colorTemperature: true, color: true },
        },
      ],
    });
  });
});

describe("what the Gateway is told about a call", () => {
  it("presents the Gateway Token and a Correlation ID", async () => {
    let seen: Record<string, unknown> = {};
    answers = {
      listLights: (call, callback) => {
        seen = call.metadata.getMap();
        callback(null, { lights: [] });
      },
    };

    const result = await connect().listLights();

    expect(seen["authorization"]).toBe(`Bearer ${TOKEN}`);
    // The key the Gateway's ObservabilityInterceptor reads, carrying the same
    // id the caller is answered with: one request, findable in two journals.
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen["x-correlation-id"]).toBe(result.correlationId);
  });

  it("mints a Correlation ID per request, not per channel", async () => {
    answers = { listLights: (_call, callback) => callback(null, { lights: [] }) };

    const gateway = connect();
    const first = await gateway.listLights();
    const second = await gateway.listLights();

    expect(first.correlationId).not.toBe(second.correlationId);
  });
});

describe("reading one Light", () => {
  it("answers with the Light the Bridge knows by that id", async () => {
    let asked = "";
    answers = {
      getLight: (call, callback) => {
        asked = call.request.lightId;
        callback(null, aLightGet({ id: call.request.lightId }));
      },
    };

    const result = await connect().getLight("kitchen-1");

    expect(asked).toBe("kitchen-1");
    expect(result).toMatchObject({ ok: true, value: { id: "kitchen-1" } });
  });
});

describe("changing a Light", () => {
  it("answers with an Acknowledgement, which is never the changed Light", async () => {
    answers = {
      updateLight: (_call, callback) =>
        callback(null, {
          updated: [{ rid: "kitchen-1", rtype: RTYPE_LIGHT }],
          errors: [],
        }),
    };

    const result = await connect().updateLight("kitchen-1", { on: true });

    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: "success",
        updated: [{ rid: "kitchen-1", rtype: "light" }],
        errors: [],
      },
    });
  });

  it("carries the Correlation ID of the RPC it came from, in the Acknowledgement", async () => {
    // The Acknowledgement is what a browser is given, so it carries its own
    // Correlation ID rather than depending on whoever relays it to add one.
    // It is the same id: there was one request.
    answers = {
      updateLight: (_call, callback) =>
        callback(null, {
          updated: [{ rid: "kitchen-1", rtype: RTYPE_LIGHT }],
          errors: [],
        }),
    };

    const result = await connect().updateLight("kitchen-1", { on: true });

    expect(result.ok && result.value.correlationId).toBe(result.correlationId);
  });

  it.each([
    ["success", [{ rid: "kitchen-1", rtype: RTYPE_LIGHT }], []],
    [
      "partial",
      [{ rid: "kitchen-1", rtype: RTYPE_LIGHT }],
      [{ description: "device (light) has communication issues" }],
    ],
    ["rejected", [], [{ description: "device (light) is not turned on" }]],
  ] as const)(
    "reads %s off the two arrays the Bridge answered with",
    async (outcome, updated, errors) => {
      answers = {
        updateLight: (_call, callback) =>
          callback(null, { updated: [...updated], errors: [...errors] }),
      };

      const result = await connect().updateLight("kitchen-1", { on: true });

      expect(result).toMatchObject({
        ok: true,
        value: { outcome, errors: [...errors] },
      });
    },
  );

  it("calls an empty answer unknown rather than success, and says so", async () => {
    // Should be unreachable: the Gateway refuses an empty Command before it
    // sends one. If it happens an assumption is wrong, and claiming success is
    // the one answer that cannot be taken back.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    answers = {
      updateLight: (_call, callback) => callback(null, { updated: [], errors: [] }),
    };

    const result = await connect().updateLight("kitchen-1", { on: true });

    expect(result).toMatchObject({ ok: true, value: { outcome: "unknown" } });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it("passes a Resource type it has never heard of through as text", async () => {
    // A Resource type newer than these bindings is still a Resource the Bridge
    // named. The tier that is only relaying it must not turn it into an error.
    answers = {
      updateLight: (_call, callback) =>
        callback(null, { updated: [{ rid: "something-new", rtype: 34 }], errors: [] }),
    };

    const result = await connect().updateLight("kitchen-1", { on: true });

    expect(result).toMatchObject({
      ok: true,
      value: { updated: [{ rid: "something-new", rtype: "smart_scene" }] },
    });
  });
});

describe("what a Gateway status becomes", () => {
  // The table in issue #2, transcribed rather than read out of the code, so
  // that the two have to agree with the same third thing.
  const table = [
    [status.INVALID_ARGUMENT, "BRIDGE_REJECTED_COMMAND"],
    [status.NOT_FOUND, "LIGHT_NOT_FOUND"],
    [status.FAILED_PRECONDITION, "GATEWAY_NOT_PAIRED"],
    [status.UNAVAILABLE, "BRIDGE_UNREACHABLE"],
    [status.RESOURCE_EXHAUSTED, "BRIDGE_BUSY"],
    [status.UNIMPLEMENTED, "BRIDGE_UNSUPPORTED"],
    [status.UNAUTHENTICATED, "GATEWAY_MISCONFIGURED"],
    [status.INTERNAL, "GATEWAY_ERROR"],
    // Not in the table, and deliberately: a status nothing here anticipated is
    // the Gateway failing in a way nothing here anticipated.
    [status.DATA_LOSS, "GATEWAY_ERROR"],
  ] as const;

  it.each(table)("answers %i on a read with %s", async (code, expected) => {
    answers = { getLight: refuse(code, "what the Gateway said") };

    const result = await connect().getLight("kitchen-1");

    expect(result).toMatchObject({
      ok: false,
      code: expected,
      detail: "what the Gateway said",
    });
  });

  it.each(table)("answers %i on an update with %s", async (code, expected) => {
    answers = { updateLight: refuse(code, "what the Gateway said") };

    const result = await connect().updateLight("kitchen-1", { on: true });

    expect(result).toMatchObject({ ok: false, code: expected });
  });

  it("gives one code to FAILED_PRECONDITION's three causes, and quotes each", async () => {
    // Never paired, link button not pressed, and the Bridge answering 401 or
    // 403 because the Application Key was revoked. They are distinguishable
    // only by prose, and the prose was written to be actionable — so it is
    // passed through and never parsed for a code.
    const causes = [
      "the Gateway is not paired with a Bridge; run the pairing command",
      "press the link button on the Bridge, then try again within 30 seconds",
      "the Bridge rejected the Application Key; it has to be paired again",
    ];

    for (const cause of causes) {
      answers = { getLight: refuse(status.FAILED_PRECONDITION, cause) };

      const result = await connect().getLight("kitchen-1");

      expect(result).toMatchObject({
        ok: false,
        code: "GATEWAY_NOT_PAIRED",
        detail: cause,
      });
      gateway?.close();
    }
  });

  it("answers with the Correlation ID it sent, so a failure can be looked up", async () => {
    let seen = "";
    answers = {
      getLight: (call, callback) => {
        seen = String(call.metadata.get("x-correlation-id")[0]);
        refuse(status.NOT_FOUND, "no such light")(call, callback);
      },
    };

    const result = await connect().getLight("kitchen-1");

    expect(result.correlationId).toBe(seen);
  });
});

describe("a Gateway that cannot be reached at all", () => {
  it("is not the Bridge being unreachable, though both arrive as UNAVAILABLE", async () => {
    // Two rows of the table share a gRPC status: the Gateway sends UNAVAILABLE
    // when it cannot reach the Bridge, and grpc-js produces the same code
    // itself when there is no Gateway on the other end. They are both 503s,
    // and they name different broken machines.
    const result = await connect({ target: "localhost:1" }).listLights();

    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNREACHABLE" });
  });

  it("is what a certificate that does not verify comes to", async () => {
    // ADR 0004: the pinned PEM is the channel's only trust root, so a Gateway
    // presenting anything else is not connected to. A deployment fault, and
    // never a 401 — nobody's browser has a credential that would help.
    answers = { listLights: (_call, callback) => callback(null, { lights: [] }) };

    const result = await connect({
      certificateFile: strangerCertificateFile,
    }).listLights();

    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNREACHABLE" });
  });
});

describe("the deadline on a unary call", () => {
  it("is the five seconds the Gateway's retry policy was written for", async () => {
    // Read off what the Gateway is actually told, rather than off the constant:
    // the Gateway bounds its three jittered retries of a Safe Read inside the
    // caller's deadline, so this number is an input to its retry policy and
    // not merely a local timeout.
    let toldToFinishBy = 0;
    answers = {
      listLights: (call, callback) => {
        toldToFinishBy = Number(call.getDeadline());
        callback(null, { lights: [] });
      },
    };

    const sentAt = Date.now();
    await connect().listLights();

    // A second either way, because the clock moves between the two readings.
    expect(toldToFinishBy - sentAt).toBeGreaterThan(UNARY_DEADLINE_MS - 1_000);
    expect(toldToFinishBy - sentAt).toBeLessThan(UNARY_DEADLINE_MS + 1_000);
  });

  it(
    "tells a read that ran out of time from an update that did",
    async () => {
      // The slow test in this file, and it waits for a real deadline on
      // purpose: this is the one row of the table that must never be reported
      // as a failure, and a server-sent DEADLINE_EXCEEDED would not prove that
      // the client's own deadline produces the same answer. Both calls run
      // against a Gateway that never answers, at the same time, so the wait is
      // paid once.
      answers = { listLights: () => {}, updateLight: () => {} };

      const gateway = connect();
      const [read, update] = await Promise.all([
        gateway.listLights(),
        gateway.updateLight("kitchen-1", { on: true }),
      ]);

      // Nothing was changed by asking, and the Gateway had already retried it.
      expect(read).toMatchObject({ ok: false, code: "BRIDGE_TIMEOUT" });
      // The Command may well have been applied and the reply lost. A person is
      // told the Outcome is unknown, and never that their change failed.
      expect(update).toMatchObject({
        ok: false,
        code: "MUTATION_OUTCOME_UNKNOWN",
      });
    },
    UNARY_DEADLINE_MS + 10_000,
  );
});

describe("concurrent identical reads", () => {
  /** A Gateway that answers nothing until it is let go, and counts its calls. */
  function heldGateway() {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];

    answers = {
      listLights: async (_call, callback) => {
        calls.push("list");
        await held;
        callback(null, { lights: [aLightGet()] });
      },
      getLight: async (call, callback) => {
        calls.push(call.request.lightId);
        await held;
        callback(null, aLightGet({ id: call.request.lightId }));
      },
      updateLight: async (_call, callback) => {
        calls.push("update");
        await held;
        callback(null, { updated: [{ rid: "kitchen-1", rtype: RTYPE_LIGHT }], errors: [] });
      },
    };

    return { release, calls };
  }

  it("share one RPC, and are answered by it", async () => {
    // Every Invalidation costs a read, and several browsers react to the same
    // one at the same time. Sharing is what keeps N browsers from becoming N
    // ListLights; it is not a cache, and nothing is kept afterwards.
    const { release, calls } = heldGateway();
    const gateway = connect();

    const both = Promise.all([gateway.listLights(), gateway.listLights()]);
    release();
    const [first, second] = await both;

    expect(calls).toEqual(["list"]);
    expect(first).toEqual(second);
    // The Correlation ID is the RPC's, and there was one RPC. Two ids here
    // would be two journal entries for a request the Gateway saw once.
    expect(first.correlationId).toBe(second.correlationId);
  });

  it("are only shared with a read asking the same thing", async () => {
    const { release, calls } = heldGateway();
    const gateway = connect();

    const all = Promise.all([
      gateway.getLight("kitchen-1"),
      gateway.getLight("hallway-2"),
      gateway.listLights(),
    ]);
    release();
    await all;

    expect([...calls].sort()).toEqual(["hallway-2", "kitchen-1", "list"]);
  });

  it("are not remembered once answered, because nothing here is a cache", async () => {
    // The Bridge stays authoritative: a second read is a second question, and
    // an answer held over from the first would be the Console API inventing a
    // light state of its own.
    let calls = 0;
    answers = {
      listLights: (_call, callback) => {
        calls += 1;
        callback(null, { lights: [] });
      },
    };

    const gateway = connect();
    await gateway.listLights();
    await gateway.listLights();

    expect(calls).toBe(2);
  });

  it("never share a Mutation, however identical two look", async () => {
    // Two people asking for the same change are two Commands, and one of them
    // being answered by the other's Acknowledgement would be a change nobody
    // can account for. Reads are idempotent; this is not.
    const { release, calls } = heldGateway();
    const gateway = connect();

    const both = Promise.all([
      gateway.updateLight("kitchen-1", { on: true }),
      gateway.updateLight("kitchen-1", { on: true }),
    ]);
    release();
    await both;

    expect(calls).toEqual(["update", "update"]);
  });
});

describe("what a Command becomes on the wire", () => {
  /**
   * The bytes the Gateway received for one Command.
   *
   * Asserted on as bytes rather than as a decoded object, because the thing
   * being asserted is presence: a field that is absent and a field that is
   * present and zero decode into values that read alike and are not the same
   * request. The expected sequences below are worked out from the field
   * numbers in `lighting.proto` rather than produced by encoding anything.
   */
  async function bytesSentFor(command: LightCommand): Promise<Uint8Array> {
    answers = {
      updateLight: (_call, callback) =>
        callback(null, {
          updated: [{ rid: "k", rtype: RTYPE_LIGHT }],
          errors: [],
        }),
    };

    await connect().updateLight("k", command);

    expect(sent).toHaveLength(1);

    return sent[0] as Uint8Array;
  }

  // `UpdateLightRequest.light_id` is field 1, `command` is field 2, so every
  // request below opens with the same five bytes: the id "k", then the tag and
  // length of the LightPut that follows.
  const forLightK = [0x0a, 0x01, 0x6b];

  it("sends nothing at all for a key the Command did not carry", async () => {
    // `LightPut.on` is field 2, and `On.on` is a proto3 bool: true is written,
    // so the submessage is two bytes of tag and length plus one byte of value.
    // Nothing else appears, because nothing else was asked for.
    expect([...(await bytesSentFor({ on: true }))]).toEqual([
      ...forLightK,
      0x12,
      0x04,
      0x12,
      0x02,
      0x08,
      0x01,
    ]);
  });

  it("sends an On that says false, which is not the same as sending no On", async () => {
    // The whole point of the contract's presence rule, in seven bytes: `false`
    // is the default of a proto3 bool and is not written, so `On{on: false}`
    // encodes as a submessage with no contents — present, and empty. An
    // omitted `on` writes no field 2 at all. A Bridge told the first turns the
    // light off; a Bridge told the second leaves it alone.
    expect([...(await bytesSentFor({ on: false }))]).toEqual([
      ...forLightK,
      0x12,
      0x02,
      0x12,
      0x00,
    ]);
  });

  it("sends a brightness of zero, and no On to go with it", async () => {
    // `{"brightness": 0}` dims to nothing and leaves the light on. `Dimming`
    // is field 3 and its `brightness` is a proto3 double, so zero is again the
    // default and again encodes as an empty submessage.
    expect([...(await bytesSentFor({ brightness: 0 }))]).toEqual([
      ...forLightK,
      0x12,
      0x02,
      0x1a,
      0x00,
    ]);
  });

  it("puts a colour temperature in the oneof, and nothing in the other half", async () => {
    // ADR 0005: `color` and `color_temperature` are one field on the wire, so
    // a message carrying both is not an error — it is quietly narrowed to
    // whichever was written last. The type says which of the two this is, and
    // a request asking for both never gets this far: the schema refuses it,
    // which is `command.test.ts`'s business.
    const request = UpdateLightRequest.decode(
      await bytesSentFor({ colorTemperatureMirek: 366 }),
    );

    expect(request.command).toEqual({
      colour: { $case: "colorTemperature", colorTemperature: { mirek: 366 } },
    });
  });

  it("puts a colour in the oneof, and nothing in the other half", async () => {
    const request = UpdateLightRequest.decode(
      await bytesSentFor({ colorXy: { x: 0.17, y: 0.7 } }),
    );

    expect(request.command).toEqual({
      colour: { $case: "color", color: { xy: { x: 0.17, y: 0.7 } } },
    });
  });
});

describe("subscribing to what the Bridge is doing", () => {
  /** Everything one subscription saw, and how it ended. */
  function watch(gateway: Gateway) {
    const events: GatewayEvent[] = [];
    let ended: GatewayResult<void> | undefined;

    const subscription = gateway.subscribe({
      onEvent: (event) => events.push(event),
      onEnded: (result) => {
        ended = result;
      },
    });

    return {
      events,
      subscription,
      ending: () => ended,
      until: async (enough: () => boolean) => {
        for (let waited = 0; waited < 2_000 && !enough(); waited += 5) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        expect(enough()).toBe(true);
      },
    };
  }

  function aChange(type: Event_Type, rid: string): HueEvent {
    return {
      bridgeId: "bridge-1",
      gatewayTime: new Date(),
      happened: {
        $case: "change",
        change: {
          eventId: "e1",
          type,
          resource: { rid, rtype: RTYPE_LIGHT },
          // The Gateway offers the changed properties, typed. Nothing above
          // the adapter ever sees them: a `LightGet` here is a change, not a
          // Light, and a value shaped like a Light that is not one would be
          // indistinguishable from the real thing everywhere it went.
          update: { $case: "light", light: aLightGet({ id: rid }) },
        },
      },
    };
  }

  it("reports which Resource changed, and nothing about how", async () => {
    answers = {
      subscribe: (call) => {
        call.write(aChange(Event_Type.TYPE_UPDATE, "kitchen-1"));
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.events.length === 1);

    expect(watching.events).toEqual([
      {
        kind: "change",
        change: "changed",
        resource: { rid: "kitchen-1", rtype: "light" },
      },
    ]);
  });

  it.each([
    [Event_Type.TYPE_ADD, "added"],
    [Event_Type.TYPE_UPDATE, "changed"],
    [Event_Type.TYPE_DELETE, "removed"],
    // Not one of the three, and read as a change on purpose: the answer that
    // costs a read is the answer that cannot be wrong about a Light.
    [Event_Type.TYPE_ERROR, "changed"],
  ] as const)("reads %i as a Light having been %s", async (type, change) => {
    answers = {
      subscribe: (call) => {
        call.write(aChange(type, "kitchen-1"));
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.events.length === 1);

    expect(watching.events[0]).toMatchObject({ kind: "change", change });
  });

  it("treats a Gap as a message on the stream, not the end of one", async () => {
    // The stream does not end because the Bridge went away. A Gap says events
    // may have been missed and can never be disproven, and the Gateway follows
    // every one it announces on reconnect with a Resync.
    answers = {
      subscribe: (call) => {
        call.write({
          bridgeId: "bridge-1",
          gatewayTime: new Date(),
          happened: { $case: "gap", gap: { cause: Gap_Cause.CAUSE_RECONNECTED, missed: 0 } },
        });
        call.write(aChange(Event_Type.TYPE_UPDATE, "kitchen-1"));
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.events.length === 2);

    expect(watching.events[0]).toEqual({
      kind: "gap",
      cause: "reconnected",
      missed: 0,
    });
    expect(watching.ending()).toBeUndefined();
  });

  it("asks for Lights, with the Gateway Token and a Correlation ID and no deadline", async () => {
    // The Gateway's DeadlineInterceptor exempts streaming RPCs deliberately,
    // and a deadline set here would be fighting that: a subscription is meant
    // to last until it is cancelled.
    let asked: SubscribeRequest | undefined;
    let deadline: number | undefined;
    let metadata: Record<string, unknown> = {};
    answers = {
      subscribe: (call) => {
        asked = call.request;
        deadline = Number(call.getDeadline());
        metadata = call.metadata.getMap();
        call.write(aChange(Event_Type.TYPE_UPDATE, "kitchen-1"));
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.events.length === 1);

    expect(deadline).toBe(Infinity);
    expect(metadata["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(metadata["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    // This project models nothing but Lights, and the filter is the Gateway's
    // to apply: one upstream connection serves every subscriber, so a narrow
    // filter saves the Console API from reading what it cannot use.
    expect(asked?.resourceTypes).toEqual([RTYPE_LIGHT]);
    expect(asked?.resourceIds).toEqual([]);
  });

  it("ends cleanly when it is cancelled, and says nothing after that", async () => {
    let writing: NodeJS.Timeout | undefined;
    answers = {
      subscribe: (call) => {
        writing = setInterval(
          () => call.write(aChange(Event_Type.TYPE_UPDATE, "kitchen-1")),
          5,
        );
        call.on("cancelled", () => clearInterval(writing));
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.events.length > 0);
    watching.subscription.cancel();
    await watching.until(() => watching.ending() !== undefined);

    // Cancelling is not a failure. gRPC reports it as CANCELLED, which the
    // table has no row for, and reporting it as a Gateway error would make
    // every ordinary shutdown look like one.
    expect(watching.ending()).toMatchObject({ ok: true });
    clearInterval(writing);
  });

  it("ends cleanly when the channel is closed underneath it", async () => {
    // Shutting the Console API down is not the Gateway failing at anything,
    // and a subscriber told otherwise would log an error on every restart.
    answers = {
      subscribe: (call) => {
        call.write(aChange(Event_Type.TYPE_UPDATE, "kitchen-1"));
      },
    };

    const gateway = connect();
    const watching = watch(gateway);
    await watching.until(() => watching.events.length === 1);
    gateway.close();
    await watching.until(() => watching.ending() !== undefined);

    expect(watching.ending()).toMatchObject({ ok: true });
  });

  it("ends with the code the Gateway's status translates to", async () => {
    answers = {
      subscribe: (call) => {
        call.emit("error", {
          code: status.UNAVAILABLE,
          details: "the Bridge is not answering",
        });
      },
    };

    const watching = watch(connect());
    await watching.until(() => watching.ending() !== undefined);

    expect(watching.ending()).toMatchObject({
      ok: false,
      code: "BRIDGE_UNREACHABLE",
      detail: "the Bridge is not answering",
    });
  });

  it("ends cleanly when the Gateway closes the stream", async () => {
    // The stream ends when the client cancels it or the Gateway shuts down.
    answers = { subscribe: (call) => call.end() };

    const watching = watch(connect());
    await watching.until(() => watching.ending() !== undefined);

    expect(watching.ending()).toMatchObject({ ok: true });
  });
});
