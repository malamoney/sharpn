/**
 * The one `QueryClient` the Console runs.
 *
 * `staleTime: Infinity`: a Light's copy in this cache is never refetched on
 * its own timer or on refocus. What makes it change is an Invalidation
 * (`events/liveLights.tsx` calling `invalidateQueries`) or a person
 * navigating to a view that mounts a query for the first time — never a
 * clock. Polling a house's worth of Lights on an interval is exactly the
 * cost issue #6's event fan-out exists to avoid paying per browser.
 */
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
      },
    },
  });
}
