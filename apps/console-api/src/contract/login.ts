/**
 * What a browser sends to sign in.
 *
 * One field, because there is one password and no identity to name alongside
 * it. Separate from `command.ts` because it is refused under one code only —
 * a malformed body is `INVALID_REQUEST`, and a password that does not match
 * is not a shape problem at all, so it is never reported from here.
 */
import { z } from "zod";

export const loginCommandSchema = z.strictObject({
  password: z.string().min(1),
});

export type LoginCommand = z.infer<typeof loginCommandSchema>;

/** A login body, or the detail its refusal is reported with. */
export type LoginCommandReading =
  | { ok: true; command: LoginCommand }
  | { ok: false; detail: string };

/**
 * Read a request body as a login attempt.
 *
 * Mirrors `readLightCommand`: a route gets a Command or a detail to refuse
 * with, never a `ZodError`.
 */
export function readLoginCommand(body: unknown): LoginCommandReading {
  const parsed = loginCommandSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, detail: z.prettifyError(parsed.error) };
  }

  return { ok: true, command: parsed.data };
}
