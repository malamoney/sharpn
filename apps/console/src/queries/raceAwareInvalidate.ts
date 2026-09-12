/**
 * Invalidating a query that may already be mid-fetch.
 *
 * `queryClient.invalidateQueries` called while a query is fetching does not
 * start a new request — it dedupes into the fetch already running, whose
 * response may have been requested before whatever just changed and so
 * cannot be assumed to reflect it. Issue #8: "if events arrive during a
 * fetch, schedule another refresh rather than assuming the in-flight
 * response includes them." This waits for that fetch to settle and only
 * then invalidates, so a genuinely fresh read follows.
 */
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

const awaitingSettle = new WeakSet<Query>();

export function raceAwareInvalidate(
  queryClient: QueryClient,
  queryKey: QueryKey,
): void {
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });

  if (query === undefined || query.state.fetchStatus !== "fetching") {
    void queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }

  if (awaitingSettle.has(query)) {
    // Already waiting on this same in-flight fetch to settle — a second
    // Invalidation before then adds nothing (ADR 0002: idempotent and
    // commutative).
    return;
  }
  awaitingSettle.add(query);

  // `Query` has no `subscribe` of its own — the cache is what is
  // observable — so this listens there and filters to the one query.
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query !== query || query.state.fetchStatus === "fetching") {
      return;
    }
    unsubscribe();
    awaitingSettle.delete(query);
    void queryClient.invalidateQueries({ queryKey, exact: true });
  });
}
