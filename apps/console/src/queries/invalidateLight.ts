/**
 * Marking one Light as possibly wrong, everywhere the Console holds a copy
 * of it.
 *
 * An Invalidation names a Light and says nothing about how it differs (ADR
 * 0002), so the only thing to do with one is read that Light again — and
 * the Console holds it in two places: its own detail query, and the list,
 * where it is one entry among many. Invalidating the detail alone is a
 * no-op on the list page, where no detail query is mounted: nothing is
 * re-read, the list's `dataUpdatedAt` never advances, so the header's
 * "· N on" stays stale and a card's Pending Command is never settled by a
 * fresher read.
 *
 * TanStack refetches only queries something is observing; whichever of the
 * two is not mounted is merely marked stale, so the cost is one read of
 * what is on screen — the read ADR 0002 already budgets for ("N browsers
 * reacting to one event produce one `ListLights`"). Never `LIGHTS` with
 * `exact: false`: that would reach every other Light's detail query too.
 */
import type { QueryClient } from "@tanstack/react-query";

import { lightDetailKey, lightsListKey } from "./queryKeys.js";
import { raceAwareInvalidate } from "./raceAwareInvalidate.js";

export function invalidateLight(queryClient: QueryClient, lightId: string): void {
  raceAwareInvalidate(queryClient, lightDetailKey(lightId));
  raceAwareInvalidate(queryClient, lightsListKey);
}
