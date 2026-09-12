/**
 * Mirek and Kelvin, and the range a colour-temperature slider offers.
 *
 * Nobody has an intuition for mirek — issue #7 says so in as many words —
 * so the slider a person drags is labelled in Kelvin and this is the only
 * place the conversion happens. The Command sent to the Bridge is still
 * mirek; `1,000,000 / mirek` is its own inverse, so converting a slider's
 * Kelvin value back is the same function run the other way.
 */
import type { MirekRange } from "../api/types.js";

/** Kelvin from mirek, or mirek from Kelvin — `1,000,000 / x`, rounded. */
function reciprocalMillion(value: number): number {
  return Math.round(1_000_000 / value);
}

export function kelvinFromMirek(mirek: number): number {
  return reciprocalMillion(mirek);
}

export function mirekFromKelvin(kelvin: number): number {
  return reciprocalMillion(kelvin);
}

/**
 * Hue's own outer bound, copied from `command.ts`'s `MIREK` — the range the
 * Bridge accepts on any bulb, used when a bulb reports no `mirek_schema` of
 * its own.
 */
export const DEFAULT_MIREK_RANGE: MirekRange = {
  mirekMinimum: 153,
  mirekMaximum: 500,
};

/**
 * The Kelvin range a slider should offer for one light.
 *
 * The relationship inverts: the lowest mirek a bulb accepts is its highest
 * Kelvin. `mirekSchema` is per-bulb and the fallback is the range every bulb
 * accepts, so a bulb reporting no schema of its own still gets a slider
 * bounded by something the Bridge will not refuse.
 */
export function kelvinBoundsFor(range: MirekRange | undefined): {
  min: number;
  max: number;
} {
  const { mirekMinimum, mirekMaximum } = range ?? DEFAULT_MIREK_RANGE;

  return {
    min: kelvinFromMirek(mirekMaximum),
    max: kelvinFromMirek(mirekMinimum),
  };
}
