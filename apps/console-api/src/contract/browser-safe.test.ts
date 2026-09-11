/**
 * The contract has to be importable by a browser.
 *
 * The Console consumes these schemas rather than redeclaring the shapes, which
 * only works while nothing here reaches for Node or for protobuf. Protobuf in
 * particular stays inside the gRPC adapter: a `LightGet` is not a Light, and
 * the way to keep the two from being confused is for the tier that knows about
 * Lights to have no way to name the other one.
 *
 * `write-openapi.ts` is the exception and is excluded. It is a command-line
 * program that nothing imports, and it writes a file, which is Node's job.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));

const modules = readdirSync(here).filter(
  (name) =>
    name.endsWith(".ts") &&
    !name.endsWith(".test.ts") &&
    name !== "write-openapi.ts",
);

describe("every module in the contract", () => {
  it("is one of the files this test found", () => {
    // Named rather than counted: a module added here is only checked below if
    // it was found, and a module that disappears should be noticed too.
    expect([...modules].sort()).toEqual([
      "acknowledgement.ts",
      "command.ts",
      "errors.ts",
      "index.ts",
      "light.ts",
      "openapi.ts",
    ]);
  });

  it.each(modules)("imports nothing but zod and its neighbours", (name) => {
    const source = readFileSync(`${here}${name}`, "utf8");
    const specifiers = [...source.matchAll(/from "([^"]+)"/g)].map(
      ([, specifier]) => specifier,
    );

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      const allowed = specifier === "zod" || specifier?.startsWith("./");

      expect(allowed, specifier).toBe(true);
    }
  });
});
