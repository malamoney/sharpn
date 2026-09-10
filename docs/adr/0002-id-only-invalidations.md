# Invalidations carry ids only, though the Gateway offers the changed properties

`ResourceChange` carries `oneof update { LightGet light = 5; }` — the changed
properties, typed, for the Resource types the Gateway models. The Console API
receives them on every event and forwards none of them. What reaches a browser
is `light.changed`, `light.added` or `light.removed`, each carrying an id and
nothing else.

The Gateway's own comment says why the offer is dangerous to accept: *"Only the
properties that changed are present, exactly as the Bridge reports them. A
`LightGet` here is a change, not a light."* Forwarding it would put a value
shaped like a Light, which is not a Light, into every Console path that also
handles whole Lights — and nothing in the type would distinguish them. The
saving is one LAN round trip, on the order of milliseconds. The cost is an
ambiguity that never goes away.

## Considered Options

- **Forward `ResourceChange.light` as the event payload.** Rejected above. It is
  the efficient answer to a problem this deployment does not have: a household's
  worth of bulbs on a local network, where a read costs single-digit
  milliseconds.
- **Forward the partial only to the detail view, ids elsewhere.** Rejected.
  Two event shapes for one fact, and the detail view is exactly where a partial
  masquerading as a whole Light does the most damage.
- **Send the id and let the browser decide whether to read.** This is what
  happens, but it is worth stating that the decision is not the browser's:
  an Invalidation asserts only that the Console's copy may be wrong, so reading
  is the only thing to do with one.

## Consequences

- Every Invalidation costs a read. Two things bound that: the Console API
  single-flights concurrent identical reads, so N browsers reacting to one event
  produce one `ListLights`; and the per-browser buffer flushes on a ~50ms timer.
- **Invalidations are idempotent and commutative**, because they carry no state
  and no ordering. Two Invalidations for the same Light are the same
  Invalidation. So the per-browser buffer is a `Set` of dirty ids rather than a
  queue: it is bounded by the number of Lights in the house, overflow is not
  reachable, and "disconnect slow consumers" becomes a failure mode designed out
  rather than one handled. This is the real payoff of the decision, and it was
  not the reason for making it.
- The Console never holds partial Light state, so there is no merge step and no
  question of what an absent field means in a cached value.
- A `Gap` is not an Invalidation. `CAUSE_RECONNECTED` is forwarded as connection
  status only, because the Gateway follows every one with a Resync whose
  synthesised changes arrive as ordinary Invalidations — refetching on the Gap
  would duplicate work already in flight. The Console refetches the full
  collection only when the Console API's own subscription drops, which the
  Gateway cannot resync it through.
