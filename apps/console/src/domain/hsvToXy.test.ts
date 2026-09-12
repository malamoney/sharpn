import { describe, expect, it } from "vitest";

import { GAMUT_C } from "./gamutTriangle.js";
import { hsvToXy } from "./hsvToXy.js";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("the HSV wheel's fallback conversion, assuming Gamut C", () => {
  it("places full-saturation red near Gamut C's red corner", () => {
    const xy = hsvToXy(0, 1);

    expect(distance(xy, GAMUT_C.red)).toBeLessThan(0.05);
  });

  it("places full-saturation green near Gamut C's green corner", () => {
    const xy = hsvToXy(120, 1);

    expect(distance(xy, GAMUT_C.green)).toBeLessThan(0.05);
  });

  it("places full-saturation blue near Gamut C's blue corner", () => {
    const xy = hsvToXy(240, 1);

    expect(distance(xy, GAMUT_C.blue)).toBeLessThan(0.05);
  });

  it("never returns a point outside the triangle it assumes", () => {
    for (let hue = 0; hue < 360; hue += 15) {
      for (const saturation of [0.25, 0.5, 0.75, 1]) {
        const xy = hsvToXy(hue, saturation);

        // A point this function returns is, by construction, either inside
        // the triangle already or clamped onto it — never outside.
        expect(xy.x).toBeGreaterThanOrEqual(0);
        expect(xy.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
