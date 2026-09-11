/**
 * Protobuf stays inside the adapter.
 *
 * The Console API deals in Lights, Commands and Acknowledgements. The one
 * place that knows those are carried as `LightGet`, `LightPut` and
 * `MutationResponse` is this directory, and the point is not tidiness: a
 * `LightGet` is not a Light — it is bigger, differently spelled, and a
 * `ResourceChange` carries one that is a change rather than a Light at all —
 * and the way to keep the two from being confused is for the tiers above to
 * have no way to name the other one.
 *
 * Test files are exempt. `gen.test.ts` and `light.test.ts` reach for the
 * bindings deliberately, to assert that what this project believes about them
 * is still true; that is the opposite of depending on them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const source = fileURLToPath(new URL("..", import.meta.url));

function modulesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "gen" ? [] : modulesUnder(path);
    }

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("the generated bindings", () => {
  it("are imported by the adapter and by nothing else that ships", () => {
    const reaching = modulesUnder(source)
      .filter((path) => /from "[^"]*\/gen\//.test(readFileSync(path, "utf8")))
      .map((path) => relative(source, path))
      .sort();

    expect(reaching).toEqual([
      "gateway/adapter.ts",
      "gateway/codec.ts",
    ]);
  });
});
