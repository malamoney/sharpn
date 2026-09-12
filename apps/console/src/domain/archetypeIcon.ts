/**
 * Which of ~6 icon buckets an archetype draws as.
 *
 * There are 50 archetype values (49 named fittings plus `unspecified`), and
 * drawing them all is a week of assets for a house with fifteen bulbs —
 * issue #7 says so. This is the mapping down to `bulb`, `spot`, `strip`,
 * `lamp`, `ceiling`, `plug` and a `default` for the two values that name no
 * particular shape at all.
 *
 * A `satisfies Record<LightArchetype, IconBucket>` below is what makes this
 * exhaustive: an archetype added to `LIGHT_ARCHETYPES` and not to this table
 * fails the build rather than falling through to `default` unnoticed.
 */
import { type LightArchetype } from "../api/types.js";

export const ICON_BUCKETS = [
  "bulb",
  "spot",
  "strip",
  "lamp",
  "ceiling",
  "plug",
  "default",
] as const;

export type IconBucket = (typeof ICON_BUCKETS)[number];

const BY_ARCHETYPE = {
  unspecified: "default",
  unknown_archetype: "default",

  classic_bulb: "bulb",
  sultan_bulb: "bulb",
  flood_bulb: "bulb",
  candle_bulb: "bulb",
  luster_bulb: "bulb",
  vintage_bulb: "bulb",
  vintage_candle_bulb: "bulb",
  ellipse_bulb: "bulb",
  triangle_bulb: "bulb",
  small_globe_bulb: "bulb",
  large_globe_bulb: "bulb",
  edison_bulb: "bulb",

  spot_bulb: "spot",
  single_spot: "spot",
  double_spot: "spot",
  ground_spot: "spot",
  wall_spot: "spot",
  bollard: "spot",
  wall_washer: "spot",
  hue_centris: "spot",
  pendant_spot: "spot",

  hue_lightstrip: "strip",
  hue_lightstrip_tv: "strip",
  hue_lightstrip_pc: "strip",
  hue_tube: "strip",
  hue_play: "strip",
  christmas_tree: "strip",
  string_light: "strip",

  pendant_round: "lamp",
  pendant_long: "lamp",
  floor_shade: "lamp",
  floor_lantern: "lamp",
  table_shade: "lamp",
  table_wash: "lamp",
  wall_lantern: "lamp",
  wall_shade: "lamp",
  flexible_lamp: "lamp",
  hue_go: "lamp",
  hue_iris: "lamp",
  hue_bloom: "lamp",
  hue_signe: "lamp",

  ceiling_round: "ceiling",
  ceiling_square: "ceiling",
  recessed_ceiling: "ceiling",
  recessed_floor: "ceiling",
  ceiling_horizontal: "ceiling",
  ceiling_tube: "ceiling",

  plug: "plug",
} satisfies Record<LightArchetype, IconBucket>;

export function iconBucketFor(archetype: LightArchetype): IconBucket {
  return BY_ARCHETYPE[archetype];
}
