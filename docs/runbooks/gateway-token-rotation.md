# Runbook: rotating the Gateway Token

The Gateway reads its own token once at startup, and so does the Console API
(`apps/console-api/src/gateway/credentials.ts`) — there is no live push in
either direction, so rotation is two files and two restarts, not a config
change. [ADR 0003](../adr/0003-two-hosts.md) calls this out as **a brief
outage, not a seamless change**: expect a window where the two ends disagree.

## Symptom, if this isn't done

While the Gateway and the Console API hold different tokens, every request
that reaches the Gateway is rejected as unauthenticated. The Console API
reports this as `GATEWAY_MISCONFIGURED` (a `500`, deliberately not a `401` —
see `apps/console-api/src/contract/errors.ts` — because there is no browser
credential to fix). If you see this after a rotation, one of the two
restarts below hasn't happened yet, or happened in the wrong order.

## Steps

1. **Generate the new token.** Anything the Gateway accepts as a bearer
   token works; see the [Gateway's own
   README](https://github.com/malamoney/hue) for how it reads one in.
2. **Write it to the Gateway's own token file**, on the NixOS host, per the
   Gateway's own runbook. Do not restart it yet.
3. **Write the same token to `secrets/gateway-token`** on the Mac (no
   trailing newline needed — both ends trim what they read;
   `apps/console-api/src/gateway/credentials.ts`'s `readToken`).
4. **Restart the Gateway.** From this moment until step 5, the Gateway holds
   the new token and the Console API still holds the old one — every call
   fails as `GATEWAY_MISCONFIGURED` for the length of this step. This is the
   outage ADR 0003 names, not a bug in either process.
5. **Restart the Console API**, so it re-reads `secrets/gateway-token`:

   ```
   docker compose restart console-api
   ```

   Compose secrets are read once at container start (same as the file on
   disk), so `restart` — not `up` — is what actually re-reads the file; a
   plain `docker compose up` with nothing else changed leaves the old
   process, and the old token, running.
6. **Confirm.** `GET /readyz` on the Console API should report `channel:
   "connected"` and `subscription: "established"` again
   (`apps/console-api/src/readiness.ts`); from outside the container network,
   confirm the Console signs in and shows Lights rather than a
   `GATEWAY_MISCONFIGURED` banner.

## Why not read the token per call instead

Considered and rejected, in the same place ADR 0003 rejects it: the Gateway
itself only reads its token at startup, so re-reading it here would still
leave a window where the two disagree — it would just move which end is
stale. Reading it once, at startup, on both sides is what makes the outage
in step 4 the entire story, rather than a race that also has to be reasoned
about.
