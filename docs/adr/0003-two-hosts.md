# The Console API runs on a different host from the Gateway, and pays a PKI for it

The Gateway's README offers a shortcut this project declines:

> A listener beyond loopback is refused without both TLS and a token, and there
> is no override — a TLS-terminating proxy on the same host talks to the
> loopback listener.

Running the Console API on the Gateway's host would mean dialling
`127.0.0.1:50051` in plaintext with no Gateway Token, and none of the
following would exist: a TLS certificate for the Gateway, a stable name to
issue it for, a trust root for the Console API to verify against, a token to
generate and distribute, a rotation runbook for either, or a firewall rule.

They exist because the two services live on different machines. The Gateway
runs on a 2011 MacBook Pro under NixOS, next to the Bridge, deployed with
`nixos-rebuild`. The Console and Console API run in Docker on an arm64 Mac,
deployed with `docker compose up --build`. Those are different machines, with
different architectures, different package managers and different release
cadences, and collapsing them would mean the Bridge's host acquiring a Docker
daemon and a Node runtime so that a web UI could be redeployed without touching
it.

## Considered Options

- **Both on the NixOS box, over loopback.** Rejected, and recorded here
  precisely so it stays cheap to reverse. The Gateway supports it today with no
  code change; if the Mac stops being the right home for the Console, moving it
  deletes ADR 0004 and everything in the list above. Nothing in the REST
  contract, the event design or the Console depends on the split.
- **Both in Docker on the Mac, with the Gateway containerised too.** Rejected.
  The Gateway is a NixOS module with a hardened systemd unit, an empirically
  derived sandbox and a VM integration test; re-hosting it in a container throws
  all of that away and puts the Bridge's Application Key on the machine that
  runs a browser.

## Consequences

- The gRPC hop needs TLS and a Gateway Token, and gets them. See ADR 0004 for
  the certificate.
- **There is no mTLS.** `serve.py` builds `grpc.ssl_server_credentials` with no
  `root_certificates` and no `require_client_auth`, so TLS on this hop proves
  the Gateway's identity to the Console API and proves nothing in the other
  direction. The Gateway Token is the entire authorization story: anyone on the
  LAN holding it can change every light in the house.
- Token rotation is **a brief outage, not a seamless change**. The Gateway reads
  its token once at startup, so rotation is: write both files, restart the
  Gateway, restart the Console API — with a window in between where the two
  disagree.
- The Console is unavailable when the Mac sleeps. Docker Desktop pauses its VM,
  which kills the gRPC channel and the `Subscribe` stream. This is accepted, and
  turned to use: a lid-close/lid-open cycle exercises reconnect backoff,
  `/readyz` flapping, browser SSE reconnection and the full-collection refetch
  on subscription loss, several times a day, on real timing.
- The deployment artifact is the repository checkout on the Mac. There is no
  registry, so the git SHA and the pinned proto revision are stamped into image
  labels and reported by the Console API, or "which version is running" has no
  answer.
