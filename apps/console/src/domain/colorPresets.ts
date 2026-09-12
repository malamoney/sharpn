/**
 * Preset swatches beside the gamut picker.
 *
 * Each is a point some real bulb can plausibly reach, not a point guaranteed
 * inside every bulb's gamut — `clampToGamut` is what makes touching one safe
 * regardless, moving it onto whatever triangle this particular Light reports
 * rather than sending a value the Bridge would have to refuse or silently
 * reinterpret.
 */
import type { ColorXy } from "../api/types.js";

export interface ColorPreset {
  name: string;
  xy: ColorXy;
  /** An approximate sRGB swatch colour, for the button itself — never sent anywhere. */
  swatch: string;
}

export const COLOR_PRESETS: readonly ColorPreset[] = [
  { name: "Red", xy: { x: 0.675, y: 0.322 }, swatch: "#ff2b1f" },
  { name: "Orange", xy: { x: 0.6, y: 0.38 }, swatch: "#ff8c1a" },
  { name: "Yellow", xy: { x: 0.47, y: 0.48 }, swatch: "#ffd60a" },
  { name: "Green", xy: { x: 0.28, y: 0.6 }, swatch: "#34c759" },
  { name: "Cyan", xy: { x: 0.22, y: 0.33 }, swatch: "#2fd6d6" },
  { name: "Blue", xy: { x: 0.167, y: 0.04 }, swatch: "#3468ff" },
  { name: "Purple", xy: { x: 0.28, y: 0.12 }, swatch: "#8b3fe0" },
  { name: "Pink", xy: { x: 0.4, y: 0.2 }, swatch: "#ff5fa8" },
] as const;
