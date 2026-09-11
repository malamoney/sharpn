/**
 * The browser-facing contract as an OpenAPI document, assembled from the Zod
 * schemas rather than written out beside them.
 *
 * Nothing here restates a shape. The schemas are converted, the routes are
 * described in terms of the conversions, and `openapi.json` is what this
 * renders — so a field added to a schema is described here without anyone
 * remembering to, and a document that disagrees with the schemas fails
 * `openapi.test.ts` rather than being discovered by whoever trusted it.
 *
 * This module holds no Node and no protobuf, so the Console can import the
 * same schemas the routes validate with. `browser-safe.test.ts` is what keeps
 * that true.
 */
import { z } from "zod";

import {
  acknowledgementSchema,
  bridgeErrorSchema,
  resourceIdentifierSchema,
} from "./acknowledgement.js";
import { lightCommandSchema } from "./command.js";
import { ERRORS, type ErrorCode, errorEnvelopeSchema } from "./errors.js";
import {
  colorXySchema,
  lightArchetypeSchema,
  lightCapabilitiesSchema,
  lightSchema,
} from "./light.js";
import { loginCommandSchema } from "./login.js";

export type JsonSchema = Record<string, unknown>;

export interface ResponseObject {
  description: string;
  headers?: Record<string, JsonSchema>;
  content?: Record<string, { schema: JsonSchema }>;
}

export interface Operation {
  operationId: string;
  summary: string;
  description: string;
  parameters?: JsonSchema[];
  requestBody?: JsonSchema;
  responses: Record<string, ResponseObject>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, JsonSchema>;
    headers: Record<string, JsonSchema>;
  };
}

/** Where a component lives, in the one spelling the whole document uses. */
function ref(id: string): JsonSchema {
  return { $ref: `#/components/schemas/${id}` };
}

/**
 * The schemas the document describes, and the ids they are referenced by.
 *
 * Metadata added beside a schema is copied into its JSON Schema, which is how
 * `LightCommand` carries a rule Zod enforces in a refinement and JSON Schema
 * has no other way to state.
 */
const components = z.registry<{ id: string } & JsonSchema>();

components.add(lightArchetypeSchema, {
  id: "LightArchetype",
  description:
    "What kind of fitting a Light is, spelled the way Hue spells it. " +
    "`unspecified` is an archetype the Gateway did not recognise, and is not " +
    "Hue's own `unknown_archetype`.",
});

components.add(colorXySchema, {
  id: "ColorXy",
  description: "A CIE xy position, as the Bridge reported it.",
});

components.add(lightCapabilitiesSchema, {
  id: "LightCapabilities",
  description:
    "What a Light can be told to do. Each flag is the presence of a field on " +
    "the Bridge's own resource, so a light that cannot be coloured is not a " +
    "light that is currently black. Read these rather than guessing from the " +
    "values beside them: a dimmable light may report no brightness.",
});

components.add(lightSchema, {
  id: "Light",
  description:
    "A Light, flat and renamed. The numbers here are whatever the Bridge " +
    "reported and are not held to the ranges a Command is: a response " +
    "describes what was seen, where a Command is checked before it is sent.",
});

components.add(lightCommandSchema, {
  id: "LightCommand",
  description:
    "What to change about a Light. Presence is the whole contract: a key " +
    "this body does not carry never reaches the Bridge, and one it does " +
    "carry is sent — `false` and `0` included. `null` is refused rather " +
    "than read as absent, and a body that changes nothing is refused too. " +
    "Ranges are the Bridge's own; nothing stricter is enforced here.",
  // Zod states this as a refinement, which JSON Schema cannot carry. Stated
  // again here so that whatever is generated from the document carries the
  // rule rather than discovering it as a 400. See
  // docs/adr/0005-colour-exclusivity-guarded-twice.md.
  not: { required: ["colorXy", "colorTemperatureMirek"] },
});

components.add(resourceIdentifierSchema, {
  id: "ResourceIdentifier",
  description: "A Resource the Bridge named, in Hue's own words.",
});

components.add(bridgeErrorSchema, {
  id: "BridgeError",
  description: "What the Bridge refused, in its own words, verbatim.",
});

components.add(acknowledgementSchema, {
  id: "Acknowledgement",
  description:
    "What an update did, which is never what a Light now is. It names the " +
    "Resources the Bridge says it changed and what it refused, and it has " +
    "nowhere to carry state — read the Light to find out what it became.",
});

components.add(loginCommandSchema, {
  id: "LoginCommand",
  description:
    "The one password, and nothing else: there is no account to name " +
    "alongside it.",
});

components.add(errorEnvelopeSchema, {
  id: "ErrorEnvelope",
  description:
    "Every error, in one shape. `message` is the Console API's own words. " +
    "`detail` " +
    "is whoever refused, verbatim — the Gateway's prose, the Bridge's own " +
    "description, or its own account of what was wrong with the body.",
});

/**
 * The registered schemas as JSON Schema.
 *
 * Converted as *input* schemas, which is what decides whether an object
 * forbids the keys it does not name: a Command does, because a key nobody
 * knows is a mistake, and a Light does not, because a field added here later
 * must not make an older document call a real response invalid.
 *
 * `$schema` and `$id` are dropped. Inside `components/schemas` they say
 * nothing a reader needs and name a location the schema is not at.
 */
function convertedSchemas(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(components, {
    uri: (id) => `#/components/schemas/${id}`,
    metadata: components,
    io: "input",
  });

  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      const { $schema: _version, $id: _location, ...rest } = schema;
      return [id, rest];
    }),
  );
}

const CORRELATION_ID: JsonSchema = {
  $ref: "#/components/headers/x-correlation-id",
};

const RETRY_AFTER: JsonSchema = {
  description:
    "How long to wait before asking again, in seconds. Sent only with the " +
    "codes on this status that can be waited out; several codes share a " +
    "status, and most of them cannot.",
  schema: { type: "integer", minimum: 0 },
};

/**
 * The responses a route answers failures with, one per HTTP status.
 *
 * Several codes can share a status — a Bridge that is busy, a Gateway that is
 * not paired and a Gateway that cannot be reached are all 503 — so the codes
 * are grouped, and the description says which of them this route can produce.
 * That list is the only place the document says where a code appears, and
 * `openapi.test.ts` requires every code to appear in one.
 */
function errorResponses(
  codes: readonly ErrorCode[],
): Record<string, ResponseObject> {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERRORS[code].httpStatus;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([left], [right]) => left - right)
      .map(([status, grouped]) => [
        String(status),
        {
          description: grouped
            .map((code) => `\`${code}\` — ${ERRORS[code].meaning}`)
            .join("\n\n"),
          headers: {
            "x-correlation-id": CORRELATION_ID,
            ...(grouped.some((code) => ERRORS[code].retryAfter)
              ? { "Retry-After": RETRY_AFTER }
              : {}),
          },
          content: { "application/json": { schema: ref("ErrorEnvelope") } },
        },
      ]),
  );
}

/** What can go wrong between here and a Bridge, on any route. */
const REACHING_THE_BRIDGE = [
  "GATEWAY_NOT_PAIRED",
  "BRIDGE_UNREACHABLE",
  "BRIDGE_BUSY",
  "BRIDGE_UNSUPPORTED",
  "GATEWAY_MISCONFIGURED",
  "GATEWAY_ERROR",
  "GATEWAY_UNREACHABLE",
] as const satisfies readonly ErrorCode[];

const LIGHT_ID: JsonSchema = {
  name: "id",
  in: "path",
  required: true,
  description: "The Light's id, as the Bridge reports it.",
  schema: { type: "string", minLength: 1 },
};

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "sharpn Console API",
    // The `v1` every path carries. A change that breaks a browser is a `v2`
    // prefix, not a number moved here.
    version: "1.0.0",
    description:
      "What the Console may ask of the Console API. Generated from the Zod " +
      "schemas in `apps/console-api/src/contract`; edit those, not this.",
  },
  paths: {
    "/api/v1/session": {
      post: {
        operationId: "createSession",
        summary: "Sign in",
        description:
          "The one password, checked against the argon2id hash this " +
          "service was deployed with. A success carries no body — the " +
          "session is the cookie this sets, `HttpOnly`, `Secure`, " +
          "`SameSite=Strict`, and there is no account to describe.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("LoginCommand") } },
        },
        responses: {
          "204": {
            description: "The password matched. The cookie is the session.",
            headers: { "x-correlation-id": CORRELATION_ID },
          },
          ...errorResponses([
            "INVALID_REQUEST",
            "NOT_AUTHENTICATED",
            "CSRF_REJECTED",
            "TOO_MANY_REQUESTS",
          ]),
        },
      },
      delete: {
        operationId: "endSession",
        summary: "Sign out",
        description:
          "Clears the cookie. Answered the same way whether or not one was " +
          "there to clear: there is no session store to consult, so there " +
          "is nothing to disagree about.",
        responses: {
          "204": {
            description: "The cookie is cleared, or was never set.",
            headers: { "x-correlation-id": CORRELATION_ID },
          },
          ...errorResponses(["CSRF_REJECTED"]),
        },
      },
    },
    "/api/v1/lights": {
      get: {
        operationId: "listLights",
        summary: "Every Light the Bridge knows about",
        description:
          "Read straight through to the Bridge. Nothing is cached here, so " +
          "this is what the Bridge said a moment ago and not what the " +
          "Console API remembers.",
        responses: {
          "200": {
            description: "Every Light, in whatever order the Bridge listed it.",
            headers: { "x-correlation-id": CORRELATION_ID },
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Light") },
              },
            },
          },
          ...errorResponses([
            "NOT_AUTHENTICATED",
            ...REACHING_THE_BRIDGE,
            "BRIDGE_TIMEOUT",
          ]),
        },
      },
    },
    "/api/v1/lights/{id}": {
      get: {
        operationId: "getLight",
        summary: "One Light",
        description:
          "The Light as the Bridge reports it now. This is the only way to " +
          "learn what a Light became: an update never answers with one.",
        parameters: [LIGHT_ID],
        responses: {
          "200": {
            description: "The Light.",
            headers: { "x-correlation-id": CORRELATION_ID },
            content: { "application/json": { schema: ref("Light") } },
          },
          ...errorResponses([
            "NOT_AUTHENTICATED",
            "LIGHT_NOT_FOUND",
            ...REACHING_THE_BRIDGE,
            "BRIDGE_TIMEOUT",
          ]),
        },
      },
      patch: {
        operationId: "updateLight",
        summary: "Change one Light",
        description:
          "Answers with an Acknowledgement and never with a Light. A 200 " +
          "means the exchange completed, which is not the same as the Bridge " +
          "having done what was asked: it can report a change it made and a " +
          "refusal about the same request, and `outcome` is how to tell " +
          "`success` from `partial` and `rejected`.",
        parameters: [LIGHT_ID],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("LightCommand") } },
        },
        responses: {
          "200": {
            description:
              "What the Bridge says the Command came to. An `outcome` of " +
              "`rejected` arrives here rather than as a 4xx: the request was " +
              "well formed and the Bridge answered it.",
            headers: { "x-correlation-id": CORRELATION_ID },
            content: {
              "application/json": { schema: ref("Acknowledgement") },
            },
          },
          ...errorResponses([
            "INVALID_REQUEST",
            "COLOR_AND_TEMPERATURE_BOTH_SET",
            "BRIDGE_REJECTED_COMMAND",
            "NOT_AUTHENTICATED",
            "CSRF_REJECTED",
            "LIGHT_NOT_FOUND",
            "TOO_MANY_REQUESTS",
            ...REACHING_THE_BRIDGE,
            "MUTATION_OUTCOME_UNKNOWN",
          ]),
        },
      },
    },
  },
  components: {
    schemas: convertedSchemas(),
    headers: {
      "x-correlation-id": {
        description:
          "The Correlation ID this request was logged under. Minted here and " +
          "never taken from the browser; the same value appears in every " +
          "error envelope.",
        required: true,
        schema: { type: "string" },
      },
    },
  },
};

/**
 * The document as `openapi.json` holds it: two-space JSON with a trailing
 * newline, which is what a diff and an editor both expect.
 */
export function renderOpenApiDocument(): string {
  return `${JSON.stringify(openApiDocument, null, 2)}\n`;
}
