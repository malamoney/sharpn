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

## Status

Nothing is built yet. The contract has been read against the Gateway's source at
`e3bef6b14545b08cc14ad57b9fb7a75a5a060332`, the vocabulary is written down, and
the five decisions that would otherwise read as arbitrary are recorded.
