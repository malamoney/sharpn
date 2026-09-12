/**
 * The order the Light list is shown in.
 *
 * `ListLights` returns no defined order, so the Bridge is free to answer the
 * same collection in a different order on every read. A collator alone would
 * still reshuffle two Lights sharing a name across a refetch — this is why
 * `id` breaks the tie rather than leaving it to whatever order arrived.
 */
import type { Light } from "../api/types.js";

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

export function sortLightsByName(lights: readonly Light[]): Light[] {
  return [...lights].sort((left, right) => {
    const byName = collator.compare(left.name, right.name);
    return byName !== 0 ? byName : left.id.localeCompare(right.id);
  });
}
