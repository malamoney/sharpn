/**
 * Invalidating a query — or every query under a prefix — that may already
 * be mid-fetch.
 *
 * `queryClient.invalidateQueries` called while a match is fetching does not
 * start a new request — it dedupes into the fetch already running, whose
 * response may have been requested before whatever just changed and so
 * cannot be assumed to reflect it. Issue #8: "if events arrive during a
 * fetch, schedule another refresh rather than assuming the in-flight
 * response includes them." This waits for every currently-fetching match to
 * settle and only then invalidates, so a genuinely fresh read follows —
 * `exact: false` is what `LiveLightsProvider`'s full-collection resync uses,
 * since it names a prefix covering the list and every cached Light at once,
 * any of which may itself be mid-fetch at the moment the resync fires.
 */
import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";

const scheduledFollowUps = new WeakMap<QueryClient, Set<string>>();

export function raceAwareInvalidate(
  queryClient: QueryClient,
  queryKey: QueryKey,
  { exact = true }: { exact?: boolean } = {},
): void {
  const stillFetching = () =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey, exact })
      .some((query) => query.state.fetchStatus === "fetching");

  if (!stillFetching()) {
    void queryClient.invalidateQueries({ queryKey, exact });
    return;
  }

  let scheduled = scheduledFollowUps.get(queryClient);
  if (scheduled === undefined) {
    scheduled = new Set();
    scheduledFollowUps.set(queryClient, scheduled);
  }

  const scopeKey = `${exact}:${hashKey(queryKey)}`;
  if (scheduled.has(scopeKey)) {
    // A follow-up for this exact scope is already waiting on the same
    // in-flight fetch(es) to settle — a second Invalidation before then adds
    // nothing (ADR 0002: idempotent and commutative).
    return;
  }
  scheduled.add(scopeKey);

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (stillFetching()) {
      return;
    }
    unsubscribe();
    scheduled.delete(scopeKey);
    void queryClient.invalidateQueries({ queryKey, exact });
  });
}
