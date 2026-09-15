# Deploying: first time, on the Mac

Two containers, `nginx` and `console-api`, on one user-defined bridge network
(`docker-compose.yml`). Nginx serves the Console's build and is the only thing
the host publishes a port to; the Console API is reachable from Nginx over
that network alone. See [ADR 0003](./adr/0003-two-hosts.md) for why the
Gateway is a third machine rather than a third container, and
[ADR 0004](./adr/0004-self-signed-pinned-no-ca.md) for the certificate that
hop uses.

This is a one-time setup. Once it's done, `scripts/deploy.sh` is what you run
again — see [docs/runbooks/rollback.md](./runbooks/rollback.md).

## 1. `.env`

```
cp .env.example .env
```

Fill in `GATEWAY_HOSTNAME`, `GATEWAY_PORT` and `GATEWAY_HOST_IP` — the name
and LAN address of the NixOS box the Gateway runs on. `GATEWAY_HOSTNAME` has
to match the Subject Alternative Name on the certificate in step 2; the
Console API's container has no mDNS resolver, which is why the IP is also
given by hand (`docker-compose.yml`'s `extra_hosts`, ADR 0004).

## 2. Secrets

Four files, none of them committed (`.gitignore`), each becoming
`/run/secrets/<name>` inside a container (`docker-compose.yml`'s top-level
`secrets:`, and `apps/console-api/src/config.ts`'s defaults):

| File | Contents |
| --- | --- |
| `secrets/gateway-certificate` | The Gateway's self-signed PEM (ADR 0004). Copy it from the NixOS box; it is not a secret and publishing it would be harmless, but it is the Console API's only trust root for that hop. |
| `secrets/gateway-token` | The Gateway Token, exactly as the Gateway's own config holds it. No trailing newline needed — both ends trim what they read. |
| `secrets/password-hash` | An argon2id hash of the one password this deployment accepts. Generate it with `npm run --workspace=apps/console-api hash-password -- '<password>'` and write only the hash it prints. |
| `secrets/session-secret` | A random signing key for the session cookie (`apps/console-api/src/auth/session.ts`). `openssl rand -base64 32` is enough; nothing reads it back except this process. |

None of these are read as environment variables — see `config.ts`'s own
comment for why — so `docker inspect`, a crash dump, and a process listing
never see one. This mirrors the Gateway's own `/run/credentials/hue-grpc.service/…`
(its systemd `LoadCredential`) deliberately, so one mental model — a secret is
a file at a fixed path, never an environment variable — covers both hosts,
and a rotation runbook written for one reads naturally for the other.

**Set `chmod 600` on each file, and know what it does and doesn't buy you.**
Docker Desktop's virtiofs, which is what shares this directory into the
container on macOS, does not faithfully map file modes across that boundary —
the `0600` set here on the Mac is not necessarily the mode the container
sees. The control that actually protects these files is the Mac's own
filesystem permissions on `secrets/` plus only one account running Docker on
this machine, not the in-container mode. Setting it is still worth doing —
it is correct on the host, and costs nothing — but nobody should mistake it
for the boundary that matters.

## 3. TLS, browser side

The session cookie is `Secure` (`apps/console-api/src/http/session.ts`), so it
is never sent over plain HTTP — this hop needs a certificate a browser will
actually trust, which is what [mkcert](https://github.com/FiloSottile/mkcert)
is for:

```
mkcert -install                                  # once per device that opens the Console
mkcert -cert-file certs/fullchain.pem -key-file certs/privkey.pem \
  <mac-name>.local <mac-lan-ip>
```

`<mac-name>.local` is the Mac's own Bonjour name — the easiest name on this
hop, unlike the Gateway hop, because Apple devices resolve `.local` themselves
(ADR 0004 contrasts the two). Give the certificate the LAN IP too, as a second
Subject Alternative Name, for anything on the network that isn't resolving
`.local`.

`mkcert -install` puts mkcert's own root in that device's trust store — do
this on every device that will open the Console, including running the
equivalent step on iOS under **Settings → General → About → Certificate Trust
Settings**, which is easy to forget and is the whole reason a page loads with
a certificate warning after the first two steps succeed.

Nginx reads `certs/fullchain.pem` and `certs/privkey.pem`, mounted read-only
(`docker-compose.yml`); nothing here is baked into the image, because a
certificate belongs to whichever Mac is running the containers this week.

## 4. Build and start

```
scripts/deploy.sh
```

Stamps the image with the git SHA and the pinned proto revision
(`proto/PINNED`) and runs `docker compose up --build --detach`. Both are
reported by `GET /version` and recorded as image labels
(`docker inspect <image> --format '{{json .Config.Labels}}'`) — with no
registry, the checkout on this Mac plus this stamp is the entire answer to
"which version is running" (ADR 0003).

## 5. Prove it

```
scripts/smoke-live-updates.sh
```

Opens a browser's event stream, flips one Light through the Console API, and
waits for the `light.changed` that says so to come back down the stream. One
bulb blinks for a second. This is the check `/readyz` cannot make: a
subscription can be `established` to a Gateway that has itself gone deaf to
the Bridge, and only asking for an event tells the two apart
([live-updates-stopped.md](./runbooks/live-updates-stopped.md)).

## Runbooks

Once this is running, see [`docs/runbooks/`](./runbooks/) for what to do
when:

- [a Gateway Token needs to change](./runbooks/gateway-token-rotation.md)
- [the Gateway's certificate needs to change](./runbooks/certificate-rotation.md)
- [the Gateway refuses to pair after an Application Key is revoked](./runbooks/revoked-application-key-recovery.md)
- [a deploy needs to be undone](./runbooks/rollback.md)
- [the Console stops following changes made elsewhere](./runbooks/live-updates-stopped.md)
