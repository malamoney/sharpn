# Runbook: rotating the Gateway's certificate

This is the certificate on the gRPC hop — the Gateway's self-signed leaf,
pinned as the Console API's only trust root for that connection
([ADR 0004](../adr/0004-self-signed-pinned-no-ca.md)). It is not the
browser-facing certificate `docs/deployment.md` covers with `mkcert`; that
one is issued by a trusted local CA and rotating it is a re-run of the same
`mkcert` command, not this runbook.

There is no CA on this hop and nothing renews itself. **Diarise the
expiry** — put it on a calendar, not just in this file — or the first anyone
hears of it is an outage.

## Symptom, if the expiry is missed

A certificate that fails to verify means no channel comes up at all, which
looks — from the Console API's side — exactly like there being no Gateway
there. It is reported as `GATEWAY_UNREACHABLE` (a `503`;
`apps/console-api/src/contract/errors.ts`), the same code an unplugged
Gateway would produce. If you see `GATEWAY_UNREACHABLE` and the Gateway is
plainly running, check the certificate's expiry before anything else.

## Steps

1. **Mint a new certificate** on, or for, the Gateway's NixOS host. Give it a
   Subject Alternative Name matching `GATEWAY_HOSTNAME` in `.env` — the same
   name the Console API's container is told to resolve via
   `docker-compose.yml`'s `extra_hosts` (ADR 0004 rejected mDNS here: the
   container's resolver has none, unlike the browser-facing hop).
2. **Install it on the Gateway**, per the Gateway's own runbook, so
   `serve.py` presents it. Do not restart the Console API yet.
3. **Copy the same PEM to the Mac**, replacing `secrets/gateway-certificate`.
   This file is not itself a secret — ADR 0004 is explicit that publishing it
   would be harmless — but it must never be added to any system trust store;
   its whole point is being trusted for exactly this one name and nothing
   else.
4. **Restart the Gateway**, if step 2 didn't already require it.
5. **Restart the Console API**, so it re-reads the pinned certificate:

   ```
   docker compose restart console-api
   ```

6. **Confirm.** `GET /readyz` should report `channel: "connected"`
   (`apps/console-api/src/readiness.ts`). A certificate mismatch here fails
   closed — the old pinned PEM verifies nothing the new certificate presents
   — so there is no window of the two sides disagreeing the way a token
   rotation has; either both sides already agree, or the channel does not
   come up at all.

## Telling this apart from a token problem

Both surface with the Console signed out or stuck loading, but as different
codes: a certificate that doesn't verify is `GATEWAY_UNREACHABLE` (`503`,
no channel at all); a Gateway Token the Gateway rejects is
`GATEWAY_MISCONFIGURED` (`500`, a channel came up and was refused
`UNAUTHENTICATED`). Neither is ever a `401` — that would send a person to a
sign-in screen that cannot fix a deployment fault
(`apps/console-api/src/contract/errors.ts`; see also
[gateway-token-rotation.md](./gateway-token-rotation.md)).
