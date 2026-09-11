# sharpn

A web application for managing Philips Hue lights, backed by the
[hue-grpc Gateway](https://github.com/malamoney/hue).

The Gateway owns the Bridge: its credentials, its retry rules, and its event
recovery. This project owns everything a browser touches — the **Console** a
person uses, and the **Console API** that translates its requests into gRPC and
its event stream into Server-Sent Events. Nothing here talks to a Bridge, and no
browser ever sees a Gateway Token.

See [`CONTEXT.md`](./CONTEXT.md) for the project's vocabulary and
[`docs/adr/`](./docs/adr) for the decisions that are hard to reverse. The work
itself is tracked in the [open issues](https://github.com/malamoney/sharpn/issues).

## Shape

```
Browser ──HTTPS: REST and SSE──▶ Nginx ──▶ Console API ──gRPC/TLS──▶ Gateway ──▶ Bridge
         └─────────── one Mac, two containers ──────────┘  └── NixOS host ──┘
```

## Layout

```
apps/console                     The Console. Vite, React, TypeScript.
apps/console-api                 The Console API, and the bindings generated
                                 from the Gateway's contract.
apps/console-api/src/auth        The password check and the signed session
                                 cookie. No user identity and no session
                                 store: one password, one secret, one cookie.
apps/console-api/src/contract    The browser-facing contract: the schemas both
                                 tiers agree about.
apps/console-api/src/gateway     The gRPC adapter: the only thing that talks to
                                 the Gateway, and the only place protobuf is
                                 named.
apps/console-api/src/http        The routes, and everything a request passes
                                 through on the way to one: the body limit, the
                                 Mutation meter, and the envelope every failure
                                 leaves in.
apps/console-api/src/server.ts   The process. Reads its settings, opens the one
                                 channel, holds one subscription, and listens.
apps/console-api/openapi.json    Those schemas as an OpenAPI document.
                                 Generated. Not edited.
proto/hue/v1                     The Gateway's contract, vendored. Not edited
                                 here.
proto/PINNED                     The revision it is vendored from.
docs/adr                         The decisions that are hard to reverse.
```

## Working on it

Node 24, as `.nvmrc` says. `npm ci` installs both workspaces, and `npm run
build`, `npm run typecheck` and `npm test` each run in every workspace that
defines them — the Console has nothing to test yet, so `npm test` is currently
the Console API's alone.

The Gateway's `.proto` files are vendored rather than fetched during a build,
and the TypeScript generated from them is committed, so no image build needs
protoc. Both copies can therefore be edited, and nothing but CI would notice:
`npm run proto:vendor:check` re-fetches the pinned revision and diffs it against
`proto/hue/v1`, and `npm run proto:generate:check` regenerates the bindings and
diffs those. To take a newer contract, move `revision` in `proto/PINNED` and
then run both halves:

```
npm run proto:vendor
npm run proto:generate
```

`npm start -w @sharpn/console-api` runs the built Console API. It needs
`GATEWAY_TARGET` — `host:port`, where the host is the name the Gateway's
certificate was issued for — and refuses to start without it, because a Console
API that starts not knowing where the Gateway is answers every request with a
502 and looks from the outside like a Gateway that is down. `PORT`,
`GATEWAY_CERTIFICATE_FILE`, `GATEWAY_TOKEN_FILE`, `PASSWORD_HASH_FILE` and
`SESSION_SECRET_FILE` have defaults that match where compose mounts a secret;
`GIT_SHA` and `PROTO_REVISION` are what `/version` reports, and say `unknown`
on a build that was not stamped.

`PASSWORD_HASH_FILE` holds an argon2id hash, not the password itself, and
`SESSION_SECRET_FILE` holds the key session cookies are signed with — both
read once at startup, for the reason the Gateway Token is (`config.ts`). A
hash for the shared password is produced with the same library the service
verifies against:

```
node -e 'require("@node-rs/argon2").hash(process.argv[1]).then(console.log)' \
  'the household password' > password-hash
```

Rotating either file — a new password, or a fresh signing secret — signs
every browser in the house out at once; see [ADR
0006](./docs/adr/0006-stateless-signed-session-no-revocation.md) for why that
is the only grain a shared password has.

The browser-facing contract is defined once, as Zod schemas in
`apps/console-api/src/contract`, and `openapi.json` is generated from them by
`npm run openapi:generate`. Editing that document by hand is the failure mode
worth knowing about, and it is not caught by a linter: a test renders the
schemas and compares, so a document that has been edited — or one that was left
behind when a schema changed — fails `npm test` and names the command that
fixes it.

The adapter's tests run against a fake Gateway in the same process, over a real
TLS channel with a certificate `openssl` mints into a temporary directory while
the tests start — so they exercise the pinned-certificate arrangement and the
Gateway Token rather than describing it. One of them waits five seconds on
purpose: a Mutation that runs out of time must be reported as an unknown
Outcome and never as a failure, and only a real deadline proves that.

`ts-proto` runs with `oneof=unions`, which is load-bearing rather than a
preference — see [ADR 0005](./docs/adr/0005-colour-exclusivity-guarded-twice.md).
Note that `proto:generate:check` cannot guard it: change the flag, regenerate,
and the output matches the flag that produced it. `npm run proto:flags:check`
is what asserts the flag itself, and `apps/console-api/src/gen.test.ts` catches
the shapes it produces going missing.

## Status

The skeleton is built: two workspaces, the Gateway's contract vendored at the
revision `proto/PINNED` names, and typed bindings generated from it. The
browser-facing contract is defined too — the Light a browser sees, the Command
it sends, the Acknowledgement it gets back, and the one error envelope every
failure arrives in — along with the OpenAPI document generated from it.

Something talks to a Gateway now. The adapter opens one channel, verifies the
pinned certificate, presents the Gateway Token, mints a Correlation ID per
request, shares concurrent identical reads, retries no Mutation ever, and
translates every status in the table into the code a browser is answered with.
It reads Lights, sends Commands, answers with Acknowledgements and listens for
changes — and it hands the tiers above it no protobuf at all.

Lights are served, too. The contract's three routes answer in the shapes the
document describes: a read goes straight through to the Bridge, an update
answers with an Acknowledgement and never with a Light, an update that ran out
of time is reported as an Outcome nobody knows rather than as a failure, and a
Command carrying both a colour and a colour temperature is refused before a
message is built. `/healthz`, `/readyz` and `/version` answer whoever is
running it — `/readyz` on the channel and the subscription only, and never on
whether a Bridge can be reached. The edge mints every Correlation ID rather
than believing one, reads 8KB of a body and no more, and meters Mutations at
sixty a minute while leaving reads unmetered.

A browser can sign in now, too. One shared password, checked against an
argon2id hash, opens a session that is a signed cookie and nothing this
process remembers — `HttpOnly`, `Secure`, `SameSite=Strict`, sliding thirty
days from whichever request was last authenticated. Every Light route sits
behind it, a mutation is refused if its Origin does not match this service's
own, and a login attempt is rate limited by address before a password is even
checked.

The Console still shows no Lights and there is no event stream yet. The
vocabulary is written down and the six decisions that would otherwise read as
arbitrary are recorded.
