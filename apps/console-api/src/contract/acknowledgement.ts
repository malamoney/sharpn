/**
 * What an update answers with, which is never the Light it changed.
 *
 * `hue.v1.LightingService/UpdateLight` answers with a `MutationResponse`: the
 * Resources the Bridge says it changed, and what it refused. A
 * `ResourceIdentifier` is an `rid` and an `rtype`, so the Gateway can say
 * *which* Resources changed and has no way at all to say what they now are.
 * This shape is the same shape, and ADR 0001 is why it is not quietly improved
 * into one that carries a Light.
 */
import { z } from "zod";

/**
 * What an Acknowledgement says a Mutation came to.
 *
 * Derived from the two arrays and nothing else — `updated` non-empty with no
 * errors is `success`, both non-empty is `partial`, errors alone is
 * `rejected`, and neither is `unknown`. The last should be unreachable: the
 * Gateway refuses an empty Command before sending one, so if it happens an
 * assumption is wrong, and claiming success is the one answer that cannot be
 * taken back.
 */
export const OUTCOMES = ["success", "partial", "rejected", "unknown"] as const;

export const outcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof outcomeSchema>;

/**
 * A Resource the Bridge named, in Hue's own words.
 *
 * `rtype` is passed through as text rather than enumerated: the Console only
 * compares it, and a Resource type this Gateway has never seen must not become
 * an error in the tier that is only relaying it.
 */
export const resourceIdentifierSchema = z.object({
  rid: z.string().min(1),
  rtype: z.string().min(1),
});

/**
 * What the Bridge refused, in its own words.
 *
 * One field, because that is all Hue's spec describes. It stays an object so
 * that a Bridge reporting more than a description one day widens this rather
 * than breaking it — the same reason the Gateway did not flatten it either.
 */
export const bridgeErrorSchema = z.object({
  description: z.string(),
});

/** Evidence that a Command was accepted, and nothing more than that. */
export const acknowledgementSchema = z.object({
  outcome: outcomeSchema,
  updated: z.array(resourceIdentifierSchema),
  errors: z.array(bridgeErrorSchema),
  correlationId: z.string(),
});

export type Acknowledgement = z.infer<typeof acknowledgementSchema>;
export type ResourceIdentifier = z.infer<typeof resourceIdentifierSchema>;
export type BridgeError = z.infer<typeof bridgeErrorSchema>;
