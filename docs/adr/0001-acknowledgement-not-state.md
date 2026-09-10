# An update answers with an Acknowledgement, never with the changed Light

`hue.v1.LightingService/UpdateLight` answers with a `MutationResponse`, and a
`MutationResponse` holds `repeated ResourceIdentifier updated` and
`repeated Error errors`. A `ResourceIdentifier` is a `rid` and an `rtype`. The
Gateway can therefore tell the Console API *which* Resources the Bridge says it
changed and *what* it refused, and it has no way at all to say what those
Resources now are.

So `PATCH /api/v1/lights/:id` answers with an **Acknowledgement**: an Outcome,
the identifiers the Bridge reported, the Bridge's own error descriptions, and a
Correlation ID. It never carries a Light. An Acknowledgement is evidence that a
Command was accepted; it is never evidence that a bulb is now lit a particular
way, and the REST contract is shaped so that nothing can mistake one for the
other.

## Considered Options

- **Re-read the Light with `GetLight` after a successful update and return
  that.** Rejected, and it is the obvious one. The re-read races both the
  Bridge's own settling time and the event stream: the Invalidation for this
  very change is frequently already in flight, so the response would carry
  state *older* than what the Console is about to fetch anyway. Two sources
  disagreeing about the same Light, arriving milliseconds apart, is a problem
  the Console would then have to arbitrate forever — in exchange for saving one
  read.
- **Return the Acknowledgement plus a best-effort re-read, labelled as possibly
  stale.** Rejected. It is the same arbitration problem with a field that
  admits to it. A consumer still has to decide which half to believe, and the
  label does not tell it how.
- **Treat `updated` as the new state.** Not available. It is an identifier.

## Consequences

- The Console can never render what it asked for as what is true. **Pending
  Command** exists in `CONTEXT.md` because of this decision, and it is tracked
  outside the query cache: TanStack Query's optimistic-update helpers assume the
  mutation response confirms the new value, and here it structurally cannot.
- `success`, `partial` and `rejected` are derived from the two arrays:
  `updated` non-empty and `errors` empty; both non-empty; `updated` empty and
  `errors` non-empty.
- **`updated` empty and `errors` empty is `unknown`, not `success`.** It should
  be unreachable — the Gateway refuses an empty Command before sending — so if
  it happens an assumption is wrong, and claiming success is the one answer
  that cannot be taken back. It is logged at error level.
- A `DEADLINE_EXCEEDED` on an update means the Command may have been applied and
  the reply lost. That is `504 MUTATION_OUTCOME_UNKNOWN` — a non-2xx, because
  the RPC did not complete — and the Console must not report it as a failure.
  The same status on a Safe Read is a plain `504 BRIDGE_TIMEOUT`: the Gateway
  already retried it three times, and nothing was changed by asking.
- `Error` carries one field, `description`. There is no code and no field path
  to key on, so error descriptions are surfaced verbatim rather than
  interpreted.
