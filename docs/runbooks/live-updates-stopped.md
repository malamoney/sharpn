# Runbook: the Console stops following changes made elsewhere

Somebody flips a Light in the Hue app and the Console does not move. Reads
and Commands from the Console itself still work — the switch toggles, the
Acknowledgement comes back — so nothing is *down*. What has stopped is the
one thing that flows the other way: Invalidations, from the Bridge through
the Gateway and the Console API to every open browser (ADR 0002).

Three connections carry that flow, and every one of them can die without
saying so. A connection that is idle looks exactly like one whose other end
has vanished without a FIN, and an event stream is idle whenever nothing in
the house is changing. `/readyz` reports `subscription: established` in
both cases. This happened for 34 hours in September 2026: the Gateway's own
stream from the Bridge went half-open overnight, every subscriber heard
nothing, and every health check stayed green
([malamoney/hue#38](https://github.com/malamoney/hue/issues/38)).

## Steps

1. **Ask for an event and see whether one comes back:**

   ```
   scripts/smoke-live-updates.sh
   ```

   It flips one Light through `PATCH /api/v1/lights/:id` and waits for the
   `light.changed` naming it on `/api/v1/events`. Read the last line.

   - **GREEN.** Gateway → Console API → event stream is whole. The problem
     is in the browser or in front of it: reload the page, and if that
     fixes it, check the Console's SSE connection in the browser's network
     panel and Nginx's `/api/v1/events` location (`apps/console/nginx.conf`
     — buffering there is the failure `sse-unbuffered-through-nginx.spec.ts`
     exists for).
   - **RED, and the PATCH failed too.** Not this runbook. The Gateway or the
     Bridge cannot be reached at all; the PATCH's error envelope names
     which, and `/readyz`'s `channel` says whether the Gateway is there.
   - **RED, and the PATCH succeeded.** The Bridge took the change and the
     stream never mentioned it. Continue.

2. **Ask the Console API which subscription it thinks it has:**

   ```
   docker compose exec console-api node -e \
     "fetch('http://localhost:3000/readyz').then(r=>r.json()).then(console.log)"
   ```

   - `subscription: "lost"` — the Console API knows, and is reopening on its
     backoff (`apps/console-api/src/events/fanout.ts`; the ceiling is thirty
     seconds). Wait a minute and re-run step 1. Still red: the Gateway is
     refusing `Subscribe` — its journal in step 3 will say why.
   - `subscription: "established"` — open, but deaf. Either the Console API's
     own connection to the Gateway died without a FIN (the channel's
     keepalive finds that within about six and a half minutes —
     `gateway/adapter.ts`'s `DEFAULT_KEEPALIVE` — so re-run step 1 after
     that long before going further), or the Gateway is faithfully relaying
     a stream from the Bridge that is itself dead. Continue.

3. **On the Gateway's host, look at its stream from the Bridge.** The Gateway
   runs as `hue-grpc.service`; the Bridge's address is what the Gateway was
   configured with (`services.hue-grpc` in the host's NixOS configuration).

   ```
   journalctl -u hue-grpc --since -2d | grep -i 'eventstream\|event stream\|subscriber joined'
   ss -tnpieo | grep -A1 '<bridge address>:443'
   ```

   A healthy Gateway logs `GET …/eventstream/clip/v2 "HTTP/1.1 200 OK"` on
   every (re)connect and `event stream lost` whenever one ends. One `GET` at
   startup and nothing since, together with an `ESTAB` socket to the Bridge
   whose `lastrcv:` is hours old, is the half-open stream: the Bridge went
   away (it reboots for firmware updates overnight) and the Gateway never
   found out. As of malamoney/hue#39 the Gateway probes that socket with TCP
   keepalive and reconnects within about two minutes; a Gateway older than
   that needs step 4.

4. **Restart the Gateway:**

   ```
   sudo systemctl restart hue-grpc
   ```

   The Gateway reopens its Bridge stream, and announces a Gap and Resyncs
   to every subscriber (its ADR 0005). The Console API's own subscription
   ends with the restart and is reopened by `fanout.ts` within its backoff —
   nothing on the Mac needs restarting.

5. **Confirm** with step 1. Green, in well under a second, is the answer.

## What this does and doesn't cover

This is for a stream that is open and silent. A Gateway that is down, a
Gateway Token that no longer matches, or a certificate that no longer
verifies all fail loudly on the PATCH in step 1 and have their own runbooks:
[gateway-token-rotation.md](./gateway-token-rotation.md),
[certificate-rotation.md](./certificate-rotation.md),
[revoked-application-key-recovery.md](./revoked-application-key-recovery.md).
