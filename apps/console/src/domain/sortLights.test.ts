import { describe, expect, it } from "vitest";

import type { Light } from "../api/types.js";
import { sortLightsByName } from "./sortLights.js";

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

describe("sorting Lights for the list", () => {
  it("sorts locale-aware, case first-letter no longer decides", () => {
    // A plain `<` comparison puts every uppercase letter before every
    // lowercase one, which would put "banana" ahead of "Apple". A person
    // reading a list expects the dictionary's order, not ASCII's.
    const lights = [aLight({ id: "1", name: "banana" }), aLight({ id: "2", name: "Apple" })];

    expect(sortLightsByName(lights).map((light) => light.id)).toEqual([
      "2",
      "1",
    ]);
  });

  it("breaks a tie on name by id, so two Lights sharing a name do not swap places", () => {
    // `ListLights` returns no defined order (ADR-adjacent note in issue #7),
    // so the Bridge may hand back the same two Lights in a different order
    // on every read. Without a tiebreaker, a name tie would reorder on
    // refetch even though nothing about either Light changed.
    const first = [aLight({ id: "a", name: "Lamp" }), aLight({ id: "b", name: "Lamp" })];
    const reversed = [aLight({ id: "b", name: "Lamp" }), aLight({ id: "a", name: "Lamp" })];

    expect(sortLightsByName(first).map((light) => light.id)).toEqual([
      "a",
      "b",
    ]);
    expect(sortLightsByName(reversed).map((light) => light.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not mutate the array it is given", () => {
    const lights = [aLight({ id: "1", name: "b" }), aLight({ id: "2", name: "a" })];

    sortLightsByName(lights);

    expect(lights.map((light) => light.id)).toEqual(["1", "2"]);
  });
});
