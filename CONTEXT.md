# sharpn

A web application for managing Philips Hue lights, served to a browser and
backed by the [hue-grpc Gateway](https://github.com/malamoney/hue).

## Borrowed language

The Gateway's own vocabulary is defined in [its `CONTEXT.md`][hue-context] and
is used here unchanged: **Gateway**, **Bridge**, **Light**, **Device**,
**Resource**, **Command**, **Mutation**, **Error Envelope**, **Safe Read**,
**Gap**, **Resync**, **Subscriber**, **Gateway Token**, **Application Key**,
**Correlation ID**.

Those terms are not restated here. Where this project needs a term the Gateway
does not have, it is below.

[hue-context]: https://github.com/malamoney/hue/blob/main/CONTEXT.md

## Language

### The tiers

**Console**:
The application a person uses in their browser to see and change Lights.
_Avoid_: frontend, client, UI, React app, web app

**Console API**:
The service the Console talks to, and the only thing that talks to the
Gateway. Holds the Gateway Token; the Console never sees it.
_Avoid_: backend, server, API, Express, proxy, gateway (which is the Gateway)

The Gateway is not part of this project. Naming it as a tier here — "our
gateway", "the backend" — loses the distinction that matters most: three
things can be unavailable independently, and a person needs to be told which.

### Change and belief

**Acknowledgement**:
What the Gateway says a Mutation did — which Resources the Bridge reports it
changed, and what it refused. It names Resources and never carries their new
state, so it is evidence that a Command was accepted and never evidence that a
Light is now lit a particular way.
_Avoid_: result, confirmation, updated light, new state

**Outcome**:
What an Acknowledgement says a Mutation came to: it succeeded, it partly
succeeded, the Bridge refused it, or nobody knows. The last is not a failure —
a Command whose reply was lost may well have been applied — and it is never
reported as one.
_Avoid_: status, result, error, success/failure

**Capability**:
What a Light can be told to do, as read from a Light rather than configured
anywhere. A Light that reports no dimming cannot be dimmed; one that reports
no colour cannot be coloured, and is not a Light that is currently black.
_Avoid_: feature, supported field, light type

**Invalidation**:
Notice that the Console's copy of a Light may no longer be true. It says which
Light and says nothing about how it differs, so the only thing to do with one
is read that Light again.
_Avoid_: update, event, change notification, push

**Pending Command**:
A Command the Console has sent and not yet seen Acknowledged. It is what the
person asked for, never what is true, and the two are shown differently.
_Avoid_: optimistic update, local state, in-flight change
