import { describe, expect, it } from "vitest";

import type { Light } from "../api/types.js";
import { brandOf } from "./brandOf.js";

function aLight(overrides: Partial<Light>): Light {
  return {
    id: "id",
    name: "Light",
    archetype: "classic_bulb",
    on: true,
    capabilities: { dimming: false, colorTemperature: false, color: false },
    ...overrides,
  };
}

describe("the brand of a Light", () => {
  it("is Hue for every Light, whatever its fitting or state", () => {
    expect(brandOf(aLight({}))).toBe("hue");
    expect(brandOf(aLight({ archetype: "unknown_archetype", on: false }))).toBe("hue");
  });
});
