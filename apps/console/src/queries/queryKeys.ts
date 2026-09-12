/**
 * The two query keys everything else in the Console reads Lights through.
 *
 * `list` and `detail(id)` are disjoint on purpose — neither is a prefix of
 * the other — so that invalidating one specific Light never has to reach for
 * `exact: false` and risk catching a sibling it was not about. The one place
 * that *wants* the prefix match is `events/liveLights.tsx`'s full resync,
 * which invalidates `LIGHTS` itself.
 */
export const LIGHTS = ["lights"] as const;
export const lightsListKey = [...LIGHTS, "list"] as const;
export const lightDetailKey = (id: string) => [...LIGHTS, "detail", id] as const;
