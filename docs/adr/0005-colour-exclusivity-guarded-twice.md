# Colour and colour temperature are refused at two layers, and the rule itself is unverified

A Hue light can be told to show a colour or to show a shade of white. The
Gateway's contract models that as a protobuf `oneof`:

```proto
oneof colour {
  .hue.v1.Color color = 7;
  .hue.v1.ColorTemperature color_temperature = 5;
}
```

A `oneof` holds one member. Assigning the second **clears the first, silently**
— it is not an error, it produces no warning, and the resulting message is
perfectly well-formed. So a Command carrying both is never rejected by the wire
format; it is quietly narrowed to whichever was written last. A person asks for
warm white, gets a colour, and every log line between the browser and the Bridge
records a successful request.

That is the failure this ADR exists to prevent, and it is guarded twice:

1. **In the type system.** `ts-proto` is run with `oneof=unions`, which emits a
   discriminated union rather than two optional fields. Code that tries to set
   both does not compile. This is not ts-proto's default: `oneof=properties`
   emits exactly the two flat fields that reintroduce the hazard, so the flag is
   load-bearing and is asserted in CI.
2. **At the HTTP boundary.** A request body carrying both is refused with
   `400 COLOR_AND_TEMPERATURE_BOTH_SET`, before any message is built.

Both are needed and neither is redundant. The type guard cannot see a JSON body,
which is untyped text until it has been validated. The runtime guard is the kind
of check that gets deleted by someone who believes the type system already
covers it.

## Considered Options

- **Only the type guard.** Rejected: it protects code we write, not input we
  receive.
- **Only the runtime check.** Rejected: it leaves the adapter internally able to
  construct the broken message, and the compile-time error costs one flag.
- **A precedence rule — colour wins, or last-write wins.** Rejected. That is
  precisely the bug, with a paragraph of documentation attached to make it look
  intentional. The user asked for something; the correct answer is to say it
  cannot be done, not to pick one half and stay quiet.
- **Split it into two Mutations.** Rejected, and firmly. The Gateway refuses to
  retry or replay mutations because a change that half-happened cannot be undone
  by asking again; synthesising a second mutation in the tier above is the same
  mistake wearing a different hat. One request from a person is one Command.

## Consequences

- **The restriction may be stricter than Hue actually is.** It originates in the
  Gateway's `proto/manifest.toml`, which says so in as many words: *"UNCONFIRMED
  against real hardware: verify in #16 before anything depends on it. If Hue does
  accept both, this line is what to remove."* `malamoney/hue#16` has since closed
  — its smoke plan covered pairing, list, read, a change-and-restore on one
  light, event arrival, a forced disconnect and a journal scan, and **never
  exercised the combination**. So the note stands and nothing has verified it.
- If it turns out Hue accepts both, **the fix is upstream** — remove the `oneof`
  from the manifest, regenerate, re-vendor — and not a local workaround. In
  particular it must not be worked around by splitting into two Mutations, per
  the rejected option above.
- Verifying costs one careful request against a real Bridge on a chosen light,
  with its prior state recorded and restored. Until someone does that, this rule
  is an assumption that behaves like a fact.
- **Any test of this must assert on the serialized `LightPut`.** It cannot be an
  end-to-end test: the fake Bridge in `tools/fake_hue` applies only `on` and
  `dimming` and ignores colour entirely, so a silently-clobbered colour would
  round-trip through the whole stack as a pass. This is the one place where the
  end-to-end test is actively misleading rather than merely incomplete.

## Inherited uncertainties

Other places where the Gateway's contract records something it has not
confirmed. None of them is load-bearing today; all of them will read as settled
fact to anyone who does not go looking.

- **`LightDynamics.speed`.** Hue's own specification gives it a maximum of `0`,
  which would make the field unusable. The Gateway's `limits.py` uses `0.0–1.0`
  instead, with a comment calling the spec defective and deferring verification
  to the same closed issue. This project does not expose `dynamics` at all, so
  nothing depends on either number — but whoever exposes it later will find a
  plausible range already written down. Verify before trusting it.
- **Light names come from a deprecated field.** `LightGet.Metadata.name` is
  marked *"Deprecated, use metadata on device level"*, and this Gateway does not
  model Devices, so there is no other source. `LightPut` carries no `metadata` at
  all, which means **renaming a light is not possible through this contract** —
  not a limitation of the Console, but of what the Gateway exposes.
