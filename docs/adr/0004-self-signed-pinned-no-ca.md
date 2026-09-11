# The Gateway's certificate is self-signed and pinned, with no certificate authority

The gRPC hop that ADR 0003 created needs a certificate. It is self-signed, issued
for a name the Console API's container resolves through compose `extra_hosts`,
and the same PEM is handed to the Console API as its `rootCerts`. There is no
CA, private or otherwise.

A certificate authority exists so that a verifier can trust certificates it has
never seen before. This hop has exactly one verifier and exactly one
certificate, and it always will: the Gateway serves one client, and no browser
ever sees this certificate. Introducing a CA would add a signing key to protect,
a chain to build and validate, and a second expiry to track — all in service of
a flexibility that is definitionally unused here.

This is a different decision from the browser-facing hop, which does use a local
CA (`mkcert`) because browsers on several devices must trust it and they cannot
be handed a pinned leaf.

## Considered Options

- **A private CA (`step-ca`, or `openssl` by hand) issuing the Gateway's leaf.**
  Rejected as pure overhead at one verifier. Its one genuine advantage is that
  rotation would touch only the Gateway, and that advantage is real — see the
  consequences.
- **mDNS (`hue-gateway.local`) as the name.** Rejected. `grpc-js` resolves
  through the container's resolver, which has no mDNS. This is the opposite of
  the browser hop, where Bonjour on Apple devices makes `.local` the *easiest*
  name — the two hops have different resolvers and get different answers.
- **A real subdomain with a private-IP A record.** Rejected: no domain is owned
  for this, and it would make the gRPC hop depend on external DNS to reach a
  machine two metres away.

## Consequences

- **Rotation touches two machines.** Mint a new certificate, install it on the
  NixOS box, copy the PEM to the Mac, restart both. There is no automation and
  nothing renews itself, so the expiry has to be diarised or it will be
  discovered as an outage. This is the price of not having a CA and it is the
  one thing that would justify revisiting this ADR.
- The pinned PEM is a trust root for exactly one name. It must not be added to
  any system trust store, and it is not a secret — publishing it would be
  harmless, which is worth knowing when it is being copied between machines.
- Certificate verification failure and Gateway Token rejection are distinct
  failures with distinct causes, and both are deployment faults rather than
  anything a browser user did. A rejected token is the Gateway answering
  `UNAUTHENTICATED` over a channel that came up, and surfaces as
  `500 GATEWAY_MISCONFIGURED`. A certificate that does not verify means no
  channel came up at all, which is indistinguishable from there being no
  Gateway there, and surfaces as `503 GATEWAY_UNREACHABLE`. Neither is ever a
  401, which would send a person to a login screen that cannot help them.
