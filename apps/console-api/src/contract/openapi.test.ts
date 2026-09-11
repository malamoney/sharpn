/**
 * The OpenAPI document, which is generated and never edited.
 *
 * Two kinds of assertion live here. The first are about the document being a
 * document: every `$ref` resolves, every route is described, every error code
 * is said to appear somewhere. The second is the staleness check — the
 * committed `openapi.json` is what these schemas render — which is what makes
 * "generated, not hand-maintained" true rather than merely intended.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "./errors.js";
import { openApiDocument, renderOpenApiDocument } from "./openapi.js";

/** The committed document, which `npm run openapi:generate` writes. */
const COMMITTED = fileURLToPath(new URL("../../openapi.json", import.meta.url));

/** Every `$ref` string anywhere in the document. */
function refs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(refs);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    key === "$ref" && typeof nested === "string" ? [nested] : refs(nested),
  );
}

/** What the document resolves a `#/a/b/c` pointer to, or undefined. */
function resolve(ref: string): unknown {
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>(
      (node, segment) =>
        node === undefined || node === null || typeof node !== "object"
          ? undefined
          : (node as Record<string, unknown>)[segment],
      openApiDocument,
    );
}

describe("the document", () => {
  it("is OpenAPI 3.1, whose schemas are JSON Schema", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
  });

  it("describes the three Light routes", () => {
    const collection = openApiDocument.paths["/api/v1/lights"];
    const one = openApiDocument.paths["/api/v1/lights/{id}"];

    expect(collection && Object.keys(collection)).toEqual(["get"]);
    expect(one && Object.keys(one).sort()).toEqual(["get", "patch"]);
  });

  it("resolves every reference it makes", () => {
    const made = refs(openApiDocument);

    expect(made.length).toBeGreaterThan(0);
    for (const ref of made) {
      expect(resolve(ref), ref).toBeDefined();
    }
  });

  it("says where each error code can appear", () => {
    // Not read off the schemas: the ErrorEnvelope's enum lists every code by
    // construction, so only the route descriptions say anything.
    const described = JSON.stringify(
      Object.values(openApiDocument.paths).flatMap((path) =>
        Object.values(path).map((operation) => operation.responses),
      ),
    );

    for (const code of ERROR_CODES) {
      expect(described, code).toContain(code);
    }
  });
});

describe("the schemas it was generated from", () => {
  const schemas = openApiDocument.components.schemas;

  it("carries the Command's ranges, which are the Gateway's", () => {
    const command = schemas.LightCommand as {
      properties: Record<string, { minimum?: number; maximum?: number }>;
      additionalProperties?: boolean;
    };

    expect(command.properties.brightness).toMatchObject({
      minimum: 0,
      maximum: 100,
    });
    expect(command.properties.colorTemperatureMirek).toMatchObject({
      minimum: 153,
      maximum: 500,
      type: "integer",
    });
  });

  it("says a Command may not carry both halves of the colour oneof", () => {
    // The Zod guard is a refinement, which JSON Schema cannot express and
    // which therefore vanishes on the way here. Stated again in the document
    // so whatever is generated from the document carries the rule.
    expect(schemas.LightCommand).toMatchObject({
      not: { required: ["colorXy", "colorTemperatureMirek"] },
    });
  });

  it("refuses unknown keys in a Command and allows them in a Light", () => {
    // A Command is checked, so a key nobody knows is a mistake. A Light is
    // described, so a field added here later must not make an older document
    // call a valid response invalid.
    expect(schemas.LightCommand).toMatchObject({ additionalProperties: false });
    expect(schemas.Light).not.toHaveProperty("additionalProperties");
  });

  it("carries no $schema or $id inside the components", () => {
    for (const schema of Object.values(schemas)) {
      expect(schema).not.toHaveProperty("$schema");
      expect(schema).not.toHaveProperty("$id");
    }
  });
});

describe("the committed document", () => {
  it("is what these schemas render", () => {
    const committed = readFileSync(COMMITTED, "utf8");

    // If this fails, the schemas changed and the document did not:
    //     npm run openapi:generate
    expect(committed).toBe(renderOpenApiDocument());
  });
});
