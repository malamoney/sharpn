/**
 * The Light a browser sees.
 *
 * Flat, renamed, and much smaller than the `LightGet` it is read from. Zod is
 * the single source: `openapi.ts` generates the document from this schema, and
 * the Console reads its types off it rather than restating the shape.
 */
import { z } from "zod";

/**
 * Every archetype the Gateway can report, spelled the way Hue spells them: the
 * protobuf enum value's name with the enum's own name stripped off the front
 * and the rest lowercased, which is the rule `hue_grpc/codec.py` follows in
 * the other direction. `resource.test.ts` is what notices a firmware update
 * adding one.
 *
 * `unspecified` is both of the ways an archetype can arrive unnamed — the
 * value the Gateway decodes one it does not know to, and the `UNRECOGNIZED`
 * that bindings older than the Gateway would produce. A browser has the same
 * one thing to do with either, which is to draw a generic bulb. It is not
 * `unknown_archetype`: that is Hue's own value, chosen by whoever set the
 * light up.
 */
export const LIGHT_ARCHETYPES = [
  "unspecified",
  "unknown_archetype",
  "classic_bulb",
  "sultan_bulb",
  "flood_bulb",
  "spot_bulb",
  "candle_bulb",
  "luster_bulb",
  "pendant_round",
  "pendant_long",
  "ceiling_round",
  "ceiling_square",
  "floor_shade",
  "floor_lantern",
  "table_shade",
  "recessed_ceiling",
  "recessed_floor",
  "single_spot",
  "double_spot",
  "table_wash",
  "wall_lantern",
  "wall_shade",
  "flexible_lamp",
  "ground_spot",
  "wall_spot",
  "plug",
  "hue_go",
  "hue_lightstrip",
  "hue_iris",
  "hue_bloom",
  "bollard",
  "wall_washer",
  "hue_play",
  "vintage_bulb",
  "vintage_candle_bulb",
  "ellipse_bulb",
  "triangle_bulb",
  "small_globe_bulb",
  "large_globe_bulb",
  "edison_bulb",
  "christmas_tree",
  "string_light",
  "hue_centris",
  "hue_lightstrip_tv",
  "hue_lightstrip_pc",
  "hue_tube",
  "hue_signe",
  "pendant_spot",
  "ceiling_horizontal",
  "ceiling_tube",
] as const;

export const lightArchetypeSchema = z.enum(LIGHT_ARCHETYPES);

/** A CIE xy position, as the Bridge reported it. */
export const colorXySchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * The triangle a colour bulb can actually produce, corner to corner in CIE
 * xy — read from `LightGet.Color.gamut`, not derived from `gamut_type`.
 *
 * Optional on the Light rather than always present: the proto notes some
 * bulbs do not properly return it, in which case the whole submessage is
 * absent. A picker with nowhere to read a triangle from has one other option,
 * which issue #7 is: an HSV wheel assuming Gamut C.
 */
export const colorGamutSchema = z.object({
  red: colorXySchema,
  green: colorXySchema,
  blue: colorXySchema,
});

/**
 * The mirek range a colour-temperature bulb accepts, read from
 * `LightGet.ColorTemperature.mirek_schema`.
 *
 * `command.ts`'s `MIREK` is the range Hue's spec gives as the outer bound —
 * 153–500 — and this is the bulb's own, which the spec says varies per bulb
 * within it. Optional because the Bridge does not always report one; a
 * control with nowhere to read a range from falls back to the outer bound.
 */
export const mirekRangeSchema = z.object({
  mirekMinimum: z.number().int(),
  mirekMaximum: z.number().int(),
});

/**
 * What a Light can be told to do, read from the Light itself.
 *
 * Each flag is the presence of a field on `LightGet` and nothing else: a light
 * reporting no `dimming` cannot be dimmed, and a light reporting no `color` is
 * not a light that is currently black. They are carried rather than derived
 * from the values beside them, because a Capability and a value go absent for
 * different reasons — a dimmable light can report no brightness.
 */
export const lightCapabilitiesSchema = z.object({
  dimming: z.boolean(),
  colorTemperature: z.boolean(),
  color: z.boolean(),
});

/**
 * A Light, flat and renamed, and much smaller than the `LightGet` it is read
 * from.
 *
 * Nothing else `LightGet` carries is here: not `effects`, `effects_v2`,
 * `gradient`, `signaling`, `alert`, `dynamics`, `timed_effects`, `powerup`,
 * `geometry`, `mode`, `owner` or `service_id`. A field that is exposed is a
 * field whose compatibility this project owns, and none of those is worth
 * owning until something in the Console asks for it. `minDimLevel`,
 * `colorGamut` and `mirekSchema` are exposed because issue #7's controls ask
 * for them: a brightness slider that can floor correctly, a colour picker
 * that can draw the triangle a bulb actually produces, and a temperature
 * slider bounded by what a bulb accepts rather than by Hue's outer bound.
 *
 * The numbers here are unbounded, where a Command's are not. A response
 * reports what a Bridge said, and dropping a Light out of a list because a
 * bulb reported a brightness of 101 would be the Console API refusing to
 * describe something it can see. `command.ts` holds the ranges, which are
 * bounds on what is *sent*.
 */
export const lightSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  archetype: lightArchetypeSchema,
  on: z.boolean(),
  brightness: z.number().optional(),
  minDimLevel: z.number().optional(),
  colorTemperatureMirek: z.number().int().optional(),
  mirekSchema: mirekRangeSchema.optional(),
  colorXy: colorXySchema.optional(),
  colorGamut: colorGamutSchema.optional(),
  capabilities: lightCapabilitiesSchema,
});

export type Light = z.infer<typeof lightSchema>;
export type LightArchetype = z.infer<typeof lightArchetypeSchema>;
export type LightCapabilities = z.infer<typeof lightCapabilitiesSchema>;
export type ColorGamut = z.infer<typeof colorGamutSchema>;
export type MirekRange = z.infer<typeof mirekRangeSchema>;
