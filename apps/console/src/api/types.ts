/**
 * The Console API's contract, as the Console reads it.
 *
 * Restated here rather than imported from `@sharpn/console-api`: the Console
 * and the Console API are separate tiers (`CONTEXT.md`), and a browser-facing
 * project reaching into a server package's source is the coupling that
 * distinction exists to rule out. Each shape here mirrors
 * `apps/console-api/src/contract/*.ts` exactly; a field added there is a
 * field to add here too.
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

export type LightArchetype = (typeof LIGHT_ARCHETYPES)[number];

export interface ColorXy {
  x: number;
  y: number;
}

export interface ColorGamut {
  red: ColorXy;
  green: ColorXy;
  blue: ColorXy;
}

export interface MirekRange {
  mirekMinimum: number;
  mirekMaximum: number;
}

export interface LightCapabilities {
  dimming: boolean;
  colorTemperature: boolean;
  color: boolean;
}

/** A Light, exactly as `GET /api/v1/lights` and `GET /api/v1/lights/:id` answer with one. */
export interface Light {
  id: string;
  name: string;
  archetype: LightArchetype;
  on: boolean;
  brightness?: number;
  minDimLevel?: number;
  colorTemperatureMirek?: number;
  mirekSchema?: MirekRange;
  colorXy?: ColorXy;
  colorGamut?: ColorGamut;
  capabilities: LightCapabilities;
}

/** What a browser may ask a Light to become. Presence is the whole contract. */
export interface LightCommand {
  on?: boolean;
  brightness?: number;
  colorTemperatureMirek?: number;
  colorXy?: ColorXy;
}

export const OUTCOMES = ["success", "partial", "rejected", "unknown"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface ResourceIdentifier {
  rid: string;
  rtype: string;
}

export interface BridgeError {
  description: string;
}

/** Evidence that a Command was accepted, and nothing more than that (ADR 0001). */
export interface Acknowledgement {
  outcome: Outcome;
  updated: ResourceIdentifier[];
  errors: BridgeError[];
  correlationId: string;
}

export const ERROR_CODES = [
  "BRIDGE_REJECTED_COMMAND",
  "LIGHT_NOT_FOUND",
  "GATEWAY_NOT_PAIRED",
  "BRIDGE_UNREACHABLE",
  "BRIDGE_TIMEOUT",
  "MUTATION_OUTCOME_UNKNOWN",
  "BRIDGE_BUSY",
  "BRIDGE_UNSUPPORTED",
  "GATEWAY_MISCONFIGURED",
  "GATEWAY_ERROR",
  "GATEWAY_UNREACHABLE",
  "NOT_AUTHENTICATED",
  "CSRF_REJECTED",
  "TOO_MANY_REQUESTS",
  "INVALID_REQUEST",
  "COLOR_AND_TEMPERATURE_BOTH_SET",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    detail?: string;
    correlationId: string;
  };
}
