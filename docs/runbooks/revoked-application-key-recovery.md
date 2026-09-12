# Runbook: recovering from a revoked Application Key

The Gateway holds an Application Key with the Bridge; if the Bridge's owner
revokes it (from the Bridge's own app, or by holding its button), the Gateway
is no longer paired and every Command fails.

## Symptom

The Console API reports `GATEWAY_NOT_PAIRED` (a `503`;
`apps/console-api/src/contract/errors.ts`), whose own recorded meaning is
exactly this case: "the Gateway is not paired with a Bridge, or its
Application Key has been revoked and pairing has to be done again."
`detail` on that error carries the Gateway's own instructions — read it
before doing anything below, since the Gateway's own message may already say
what step 1 says here.

## The trap

The Gateway refuses to pair again while it still holds a Registry Entry from
the old pairing — re-running its pair command against a Bridge that has
already revoked the key does nothing, and looks like the recovery itself is
broken. **The Registry Entry has to be deleted on the Gateway host first.**
This is the one step in this runbook that isn't obvious from the error
message alone.

## Steps

1. On the Gateway's NixOS host, delete the existing Registry Entry. See the
   [Gateway's own README](https://github.com/malamoney/hue) for where it is
   kept and the exact command — this repository does not hold a copy of the
   Gateway's own state and this step happens entirely on that host.
2. Run `hue-grpc-server pair` (or whatever the Gateway's own tooling calls
   it) again, following its prompts — typically pressing the Bridge's own
   button within a short window, the same as the very first pairing.
3. Once pairing succeeds, nothing on the Mac needs to change: the Gateway
   Token and its certificate are unaffected by this — a revoked Application
   Key is the Gateway's relationship with the Bridge, not the Console API's
   relationship with the Gateway ([ADR 0003](../adr/0003-two-hosts.md)).
4. **Confirm.** `GET /readyz` on the Console API should report `channel:
   "connected"` and `subscription: "established"`
   (`apps/console-api/src/readiness.ts`) without a restart on this side —
   the existing channel and subscription recover once the Gateway itself is
   paired again, the same as after any other transient Bridge outage.

## Why this is a Gateway concern, not a Console API one

The Console API has no Bridge credentials and never did — the Gateway owns
pairing, the Application Key, and everything about the Bridge relationship
(`README.md`'s "Shape"). Nothing here retries pairing, walks a person through
pressing a button, or holds a Registry Entry, because none of that is this
project's to own. `GATEWAY_NOT_PAIRED` is reported and nothing more is
inferred from it — the same restraint `readiness.ts` names for a Bridge that
is merely unreachable, extended to a Bridge that has withdrawn trust
entirely.
