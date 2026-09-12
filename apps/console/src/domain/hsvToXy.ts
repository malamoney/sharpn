/**
 * HSV, as an HSV wheel offers it, to CIE xy — the fallback for a bulb that
 * reports no gamut of its own.
 *
 * Issue #7 asks for this only as a fallback: a colour bulb with a real gamut
 * gets the triangle picker in `gamutTriangle.ts`, operating in xy directly.
 * This is what stands in when there is no triangle to read — an HSV wheel,
 * assuming Gamut C, is the shape a person without a reachability triangle
 * still recognises as "pick a colour."
 */
import type { ColorXy } from "../api/types.js";
import { clampToGamut, GAMUT_C } from "./gamutTriangle.js";

/** One channel of gamma-corrected sRGB, per Philips' own RGB-to-xy formula. */
function gammaCorrected(channel: number): number {
  return channel > 0.04045
    ? Math.pow((channel + 0.055) / 1.055, 2.4)
    : channel / 12.92;
}

/** `h` in degrees (0–360), `s` and `v` in 0–1, to sRGB in 0–1. */
function rgbFromHsv(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return [r + m, g + m, b + m];
}

/**
 * `h` in degrees (0–360) and `s` in 0–1, at full brightness, to a point in
 * CIE xy — clamped to Gamut C, because the formula below is not guaranteed
 * to land inside it for every hue and saturation.
 */
export function hsvToXy(h: number, s: number): ColorXy {
  const [rawR, rawG, rawB] = rgbFromHsv(((h % 360) + 360) % 360, s, 1);
  const r = gammaCorrected(rawR);
  const g = gammaCorrected(rawG);
  const b = gammaCorrected(rawB);

  const capitalX = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const capitalY = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const capitalZ = r * 0.000088 + g * 0.07231 + b * 0.986039;

  const sum = capitalX + capitalY + capitalZ;
  const xy: ColorXy =
    sum === 0 ? { x: 0, y: 0 } : { x: capitalX / sum, y: capitalY / sum };

  return clampToGamut(xy, GAMUT_C);
}
