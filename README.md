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
apps/console        The Console. Vite, React, TypeScript.
apps/console-api    The Console API, and the bindings generated from the contract.
proto/hue/v1        The Gateway's contract, vendored. Not edited here.
proto/PINNED        The revision it is vendored from.
docs/adr            The decisions that are hard to reverse.
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

`ts-proto` runs with `oneof=unions`, which is load-bearing rather than a
preference — see [ADR 0005](./docs/adr/0005-colour-exclusivity-guarded-twice.md).
Note that `proto:generate:check` cannot guard it: change the flag, regenerate,
and the output matches the flag that produced it. `npm run proto:flags:check`
is what asserts the flag itself, and `apps/console-api/src/gen.test.ts` catches
the shapes it produces going missing.

## Status

The skeleton is built: two workspaces, the Gateway's contract vendored at the
revision `proto/PINNED` names, and typed bindings generated from it. Nothing talks to a Gateway yet, and the Console shows no Lights. The
vocabulary is written down and the five decisions that would otherwise read as
arbitrary are recorded.
