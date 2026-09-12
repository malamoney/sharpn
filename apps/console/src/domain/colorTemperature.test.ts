import { describe, expect, it } from "vitest";

import {
  DEFAULT_MIREK_RANGE,
  kelvinBoundsFor,
  kelvinFromMirek,
  mirekFromKelvin,
} from "./colorTemperature.js";

describe("mirek and Kelvin", () => {
  it("converts mirek to Kelvin as 1,000,000 divided by mirek", () => {
    expect(kelvinFromMirek(500)).toBe(2000);
    expect(kelvinFromMirek(250)).toBe(4000);
  });

  it("rounds to the nearest Kelvin, both ways", () => {
    // 1_000_000 / 153 = 6535.947..., which a slider has no use for.
    expect(kelvinFromMirek(153)).toBe(6536);
    expect(mirekFromKelvin(6536)).toBe(153);
  });

  it("round-trips at the range Hue's spec gives as the outer bound", () => {
    expect(mirekFromKelvin(kelvinFromMirek(DEFAULT_MIREK_RANGE.mirekMinimum))).toBe(
      DEFAULT_MIREK_RANGE.mirekMinimum,
    );
    expect(mirekFromKelvin(kelvinFromMirek(DEFAULT_MIREK_RANGE.mirekMaximum))).toBe(
      DEFAULT_MIREK_RANGE.mirekMaximum,
    );
  });
});

describe("the Kelvin bounds a slider offers", () => {
  it("falls back to Hue's outer bound when a light reports no mirek_schema", () => {
    const bounds = kelvinBoundsFor(undefined);

    // The relationship inverts: the *lowest* mirek a bulb accepts is its
    // *highest* Kelvin, and the 153-500 range a bulb reports is exactly the
    // range `command.ts`'s MIREK constant guards on the way in.
    expect(bounds).toEqual({
      min: kelvinFromMirek(DEFAULT_MIREK_RANGE.mirekMaximum),
      max: kelvinFromMirek(DEFAULT_MIREK_RANGE.mirekMinimum),
    });
  });

  it("uses the bulb's own range when the Bridge reported one", () => {
    const bounds = kelvinBoundsFor({ mirekMinimum: 153, mirekMaximum: 454 });

    expect(bounds).toEqual({
      min: kelvinFromMirek(454),
      max: kelvinFromMirek(153),
    });
  });
});
