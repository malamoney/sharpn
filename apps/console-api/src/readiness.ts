/**
 * What `/readyz` is allowed to assert.
 *
 * Two facts, and deliberately not a third. A Bridge that cannot be reached is
 * a 503 on a route; it is not a reason to take this process out of service,
 * and asserting it here would have an orchestrator restarting a Console API
 * because somebody unplugged a hub.
 *
 * The Gateway's own `grpc.health.v1.Health` cannot answer this either. It
 * reports `SERVING` unconditionally from startup and flips only on graceful
 * shutdown, so an unpaired Gateway with no Bridge at all reports healthy —
 * which makes it a fine liveness probe for the Gateway and no evidence
 * whatsoever about this process.
 *
 * `events/fanout.ts`'s `Fanout` is what keeps these true: it holds the one
 * `Subscribe` this process makes, which is also what a browser's Server-Sent
 * Events are fanned out from — one subscription, not one held for `/readyz`
 * and a second held for events. One consequence rides along with that
 * sharing: `/readyz` now recovers on the fanout's own backoff, which climbs
 * toward thirty seconds under a sustained outage, rather than the flat
 * one-second reopen a dedicated watch could afford. A slower `/readyz` after
 * a long outage is the trade a single subscription makes, not an oversight.
 */
export interface Readiness {
  /**
   * Whether the one channel to the Gateway is connected at this moment.
   *
   * This is the half that knows whether there is a Gateway. A `Subscribe` is
   * made locally and succeeds whatever is on the other end, so the fact below
   * cannot tell an established subscription from a call into nothing; the
   * channel's connectivity can, and the two are reported together for exactly
   * that reason.
   */
  channelConnected(): boolean;
  /**
   * Whether a `Subscribe` is open and has not ended.
   *
   * Both facts trail a connection that died without a FIN by the channel's
   * keepalive schedule — `gateway/adapter.ts`'s `DEFAULT_KEEPALIVE`, about six
   * and a half minutes — because until a PING goes unanswered there is nothing
   * to tell that connection from one to a Gateway with nothing to say.
   */
  subscribed(): boolean;
}
