/**
 * The Command a browser sends to change a Light.
 *
 * Separate from the Light itself because the two are checked differently: a
 * Command is refused when it is wrong, where a Light is only described. Every
 * bound in this file is therefore a bound on what leaves here, and none of
 * them is a bound on what a Bridge may report.
 */
import { z } from "zod";

import type { ErrorCode } from "./errors.js";

/**
 * The code ADR 0005's second guard refuses under, marked onto the issue that
 * guard raises so `refusalFor` can find it again.
 */
const COLOUR_BOTH_SET = "COLOR_AND_TEMPERATURE_BOTH_SET";

/**
 * What Hue will accept, copied from the Gateway's
 * `hue_grpc/lighting/limits.py` — which copied them from Hue's own document —
 * where both ends are inclusive, as `low <= value <= high`.
 *
 * They are repeated rather than derived because protobuf has no way to carry a
 * range, so the vendored contract does not know them. A bound the Console
 * API does not share with the Gateway is a request the Bridge would have
 * accepted and a person cannot make.
 *
 * `min_dim_level` is deliberately not one of them. It is a bulb describing how
 * dim it can usefully go, not a floor on what may be commanded, and enforcing
 * it here would refuse commands the Bridge takes.
 */
export const BRIGHTNESS = { minimum: 0, maximum: 100 } as const;
export const MIREK = { minimum: 153, maximum: 500 } as const;
export const GAMUT = { minimum: 0, maximum: 1 } as const;

/**
 * What a browser may ask a Light to become.
 *
 * Presence is the whole contract. A key the body does not carry is absent from
 * the Command and never reaches the Bridge; a key it does carry is sent, zero
 * and `false` included. `null` is neither, and is refused: "leave it alone"
 * and "I sent nonsense" must not collapse into one request.
 */
export const lightCommandSchema = z
  .strictObject({
    on: z.boolean().optional(),
    brightness: z
      .number()
      .min(BRIGHTNESS.minimum)
      .max(BRIGHTNESS.maximum)
      .optional(),
    colorTemperatureMirek: z
      .number()
      .int()
      .min(MIREK.minimum)
      .max(MIREK.maximum)
      .optional(),
    colorXy: z
      .strictObject({
        x: z.number().min(GAMUT.minimum).max(GAMUT.maximum),
        y: z.number().min(GAMUT.minimum).max(GAMUT.maximum),
      })
      .optional(),
  })
  .superRefine((command, ctx) => {
    if (
      command.colorXy !== undefined &&
      command.colorTemperatureMirek !== undefined
    ) {
      // ADR 0005's second guard. It lives on the schema rather than beside one
      // caller so that every use of the schema carries it, including the ones
      // written after this file.
      ctx.addIssue({
        code: "custom",
        params: { errorCode: COLOUR_BOTH_SET },
        message:
          "a colour and a colour temperature cannot be set in one command; " +
          "send colorXy or colorTemperatureMirek, not both",
      });
    }

    if (Object.keys(command).length === 0) {
      // Not a rule invented here: the Gateway aborts an empty command with
      // INVALID_ARGUMENT before it reaches the Bridge, because a PUT of `{}`
      // is answered cheerfully and changes nothing. This is the same refusal,
      // one tier earlier and in the same words.
      ctx.addIssue({
        code: "custom",
        message:
          "the command asks for no change; set the fields to change, and " +
          "leave the rest unset to leave them alone",
      });
    }
  });

export type LightCommand = z.infer<typeof lightCommandSchema>;

/**
 * The two codes a body can be refused under before anything is sent, narrowed
 * from the catalogue so that renaming one there is a compile error here.
 */
export type LightCommandRefusal = Extract<
  ErrorCode,
  "INVALID_REQUEST" | typeof COLOUR_BOTH_SET
>;

/** A Command, or the code its refusal is reported under. */
export type LightCommandReading =
  | { ok: true; command: LightCommand }
  | { ok: false; code: LightCommandRefusal; detail: string };

/**
 * Read a request body as a Command.
 *
 * A route gets a Command or an error code, and never a `ZodError`: which code
 * a refusal is reported under is part of the contract, so it is decided here
 * rather than by whoever happens to be handling the request.
 */
export function readLightCommand(body: unknown): LightCommandReading {
  const parsed = lightCommandSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      code: refusalFor(parsed.error),
      detail: z.prettifyError(parsed.error),
    };
  }

  return { ok: true, command: parsed.data };
}

/**
 * Which code a failed parse is reported under.
 *
 * Only the colour rule has one of its own; everything else a schema can refuse
 * is a malformed request and says so. The marker is carried on the issue
 * rather than read back out of its message, so rewording the message cannot
 * quietly turn a `400 COLOR_AND_TEMPERATURE_BOTH_SET` into a generic one.
 */
function refusalFor(error: z.ZodError): LightCommandRefusal {
  for (const issue of error.issues) {
    const marked =
      issue.code === "custom" ? issue.params?.["errorCode"] : undefined;
    if (marked === COLOUR_BOTH_SET) {
      return COLOUR_BOTH_SET;
    }
  }

  return "INVALID_REQUEST";
}
