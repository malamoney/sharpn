/**
 * Reading Lights. Nothing here polls: `queryClient.ts`'s `staleTime:
 * Infinity` means a Light only refetches when `events/liveLights.tsx`
 * invalidates it off an Invalidation, or when a view mounts a query for the
 * first time.
 */
import { useQuery } from "@tanstack/react-query";

import { getLight, listLights } from "../api/lights.js";
import { lightDetailKey, lightsListKey } from "./queryKeys.js";

export function useLightsQuery() {
  return useQuery({
    queryKey: lightsListKey,
    queryFn: listLights,
  });
}

export function useLightQuery(id: string) {
  return useQuery({
    queryKey: lightDetailKey(id),
    queryFn: () => getLight(id),
  });
}
