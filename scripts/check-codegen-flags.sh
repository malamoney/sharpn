#!/usr/bin/env bash
#
# Fail if buf.gen.yaml has stopped asking for the flags the bindings depend on.
#
# The other two checks cannot see this. `proto:generate:check` regenerates using
# whatever buf.gen.yaml currently says and diffs the result, so a flag that is
# changed *and* the bindings regenerated is, to that check, a matching pair. The
# typecheck and the tests in apps/console-api/src/gen.test.ts do both catch it,
# because the shapes they assert on stop existing — but each catches it as a
# consequence, several steps from the cause. This one names the cause.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="$repo_root/buf.gen.yaml"

# Why each flag cannot be dropped, printed when it goes missing.
flags=(
  "oneof=unions"
  "outputServices=grpc-js"
)
reasons=(
  "LightPut.colour is a protobuf oneof. ts-proto's default, oneof=properties,
emits it as two flat optional fields, and a Command that sets both is not an
error — the oneof silently keeps whichever was written last, so a person who
asks for warm white gets a colour and every log records success. unions emits
a discriminated union, which does not compile. See
docs/adr/0005-colour-exclusivity-guarded-twice.md."
  "The Console API's gRPC adapter needs typed clients rather than a dynamically
loaded service definition. See issue #3."
)

failed=0
for index in "${!flags[@]}"; do
  flag="${flags[$index]}"
  if ! grep -qE "^[[:space:]]*-[[:space:]]*${flag}[[:space:]]*$" "$template"; then
    printf '\nbuf.gen.yaml no longer passes `%s` to ts-proto.\n\n%s\n' \
      "$flag" "${reasons[$index]}" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo "buf.gen.yaml asks for every flag the bindings depend on."
