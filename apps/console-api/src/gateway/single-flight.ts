/**
 * Concurrent identical reads share one in-flight RPC.
 *
 * Every Invalidation carries an id and nothing else, so the only thing a
 * browser can do with one is read that Light again — and several browsers
 * reacting to the same event ask the same question at the same moment. This is
 * what keeps that from becoming several RPCs.
 *
 * Sharers are answered by the RPC that was actually made, Correlation ID
 * included. Two browsers reading the same Light at the same moment therefore
 * quote one id between them, and that is the truthful answer: the Gateway saw
 * one request, and its journal has one line to find. An id minted per caller
 * would be an id that appears in no journal but this one's.
 *
 * It is not a cache, and the distinction is the whole design. An entry lives
 * only while its RPC is in flight and is gone before any sharer is resumed, so
 * a read that starts after one finishes is a new question. Nothing is kept, no
 * Light state is stored anywhere in this tier, and the Bridge stays the only
 * thing that knows what is true.
 */
export type Share = <T>(key: string, start: () => Promise<T>) => Promise<T>;

export function singleFlight(): Share {
  const inFlight = new Map<string, Promise<unknown>>();

  return <T>(key: string, start: () => Promise<T>): Promise<T> => {
    const running = inFlight.get(key);
    if (running !== undefined) {
      // The cast is safe by construction: a key is one call with one answer,
      // and every caller of it passes the same `start`.
      return running as Promise<T>;
    }

    const started = start().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, started);

    return started;
  };
}
