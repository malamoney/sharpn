/**
 * The Light as a browser sees it: flat, renamed, and smaller than `LightGet`.
 *
 * The resource schema describes what a response carries rather than policing
 * it — the values come from a Bridge, and refusing to show a Light because a
 * bulb reported an odd number helps nobody. What is asserted here is the
 * shape: which fields exist, which may be absent, and that a Capability is
 * carried rather than guessed.
 */
import { describe, expect, it } from "vitest";

import { LightArchetype } from "../gen/hue/v1/common.js";
import { LIGHT_ARCHETYPES, lightSchema } from "./light.js";

const plainBulb = {
  id: "0ec23e3a-5e1b-4c3f-9a6b-1f2f4d0a7c11",
  name: "Hallway",
  archetype: "classic_bulb",
  on: true,
  capabilities: { dimming: false, colorTemperature: false, color: false },
};

describe("the Light resource", () => {
  it("describes a light that can do nothing but switch on and off", () => {
    expect(lightSchema.parse(plainBulb)).toEqual(plainBulb);
  });

  it("carries Capabilities rather than inferring them from the values", () => {
    // A light that reports no `color` cannot be coloured; it is not a light
    // that is currently black. So a Capability is a field of its own, and a
    // dimmable light that reported no brightness is still dimmable.
    const dimmable = {
      ...plainBulb,
      capabilities: { dimming: true, colorTemperature: false, color: false },
    };

    expect(lightSchema.parse(dimmable).capabilities.dimming).toBe(true);
    expect(lightSchema.parse(dimmable).brightness).toBeUndefined();
  });

  it("refuses a Light with no Capabilities at all", () => {
    const { capabilities: _omitted, ...withoutThem } = plainBulb;

    expect(lightSchema.safeParse(withoutThem).success).toBe(false);
  });

  it("exposes nothing else the Gateway reports", () => {
    // A field that is exposed is a field whose compatibility we own. Effects,
    // gradients, signalling, dynamics, powerup, geometry, mode, owner and
    // service id are none of ours. `minDimLevel`, `mirekSchema` and
    // `colorGamut` are: issue #7's controls read them to floor a brightness
    // slider, bound a colour-temperature slider, and draw the triangle a bulb
    // actually produces.
    expect(Object.keys(lightSchema.shape).sort()).toEqual([
      "archetype",
      "brightness",
      "capabilities",
      "colorGamut",
      "colorTemperatureMirek",
      "colorXy",
      "id",
      "minDimLevel",
      "mirekSchema",
      "name",
      "on",
    ]);
  });

  it("carries the bulb's own mirek range, separately from Hue's outer bound", () => {
    const withRange = {
      ...plainBulb,
      capabilities: { dimming: false, colorTemperature: true, color: false },
      colorTemperatureMirek: 366,
      mirekSchema: { mirekMinimum: 153, mirekMaximum: 454 },
    };

    expect(lightSchema.parse(withRange).mirekSchema).toEqual({
      mirekMinimum: 153,
      mirekMaximum: 454,
    });
  });

  it("carries the triangle a colour bulb can actually produce", () => {
    const withGamut = {
      ...plainBulb,
      capabilities: { dimming: false, colorTemperature: false, color: true },
      colorXy: { x: 0.4578, y: 0.4101 },
      colorGamut: {
        red: { x: 0.6915, y: 0.3083 },
        green: { x: 0.17, y: 0.7 },
        blue: { x: 0.1532, y: 0.0475 },
      },
    };

    expect(lightSchema.parse(withGamut).colorGamut).toEqual(
      withGamut.colorGamut,
    );
  });

  it("leaves the range and the gamut absent when the Bridge did not report them", () => {
    expect(lightSchema.parse(plainBulb).mirekSchema).toBeUndefined();
    expect(lightSchema.parse(plainBulb).colorGamut).toBeUndefined();
  });
});

describe("the archetypes", () => {
  it("are the Gateway's enum, spelled Hue's way", () => {
    // The Gateway strips the enum's name from each value and lowercases what
    // is left (`hue_grpc/codec.py`), which is how Hue spells them in the first
    // place. Doing the same here means a firmware archetype added upstream
    // fails this test rather than reaching a browser as something it has never
    // seen. `UNRECOGNIZED` is ts-proto's own marker for a number this build
    // does not know, not one of Hue's values.
    const fromProto = Object.keys(LightArchetype)
      .filter((name) => name.startsWith("LIGHT_ARCHETYPE_"))
      .map((name) => name.slice("LIGHT_ARCHETYPE_".length).toLowerCase());

    expect([...LIGHT_ARCHETYPES]).toEqual(fromProto);
  });
});
