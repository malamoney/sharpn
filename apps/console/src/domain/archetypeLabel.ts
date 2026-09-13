/**
 * An archetype value as a person would read it: `classic_bulb` is "Classic
 * bulb", `hue_lightstrip_tv` is "Hue Lightstrip TV". A Light has no room in
 * `LightGet`, so this is what a card shows under the name instead.
 *
 * The two values that name no fitting at all read as plain "Light" rather
 * than "Unspecified" — that is a fact about the Bridge's metadata, not
 * something a person can act on.
 */
import type { LightArchetype } from "../api/types.js";

const UPPERCASED = new Set(["tv", "pc"]);
const PROPER = new Set(["hue"]);

export function archetypeLabel(archetype: LightArchetype): string {
  if (archetype === "unspecified" || archetype === "unknown_archetype") {
    return "Light";
  }

  return archetype
    .split("_")
    .map((word, index) => {
      if (UPPERCASED.has(word)) {
        return word.toUpperCase();
      }
      if (index === 0 || PROPER.has(word) || archetype.startsWith("hue_")) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}
