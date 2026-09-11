#!/usr/bin/env bash
#
# Fail if apps/console-api/src/gen differs from what buf would generate now.
#
# The bindings are committed so that no image build needs protoc. That trade is
# only safe while the committed copy is the one the vendored .proto files
# produce, which is what this checks.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Both `buf` and the `protoc-gen-ts_proto` plugin it shells out to are dev
# dependencies, so the script works whether it is run by npm or by hand.
PATH="$repo_root/node_modules/.bin:$PATH"
export PATH

generated="apps/console-api/src/gen"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$repo_root" && buf generate --output "$work")

if ! diff --recursive --unified "$work/$generated" "$repo_root/$generated"; then
  cat >&2 <<'MESSAGE'

The committed bindings are not what the vendored .proto files generate.

The diff above reads: freshly generated on the left, committed copy on the
right. Regenerate and commit the result:

    npm run proto:generate
MESSAGE
  exit 1
fi

echo "$generated matches the vendored .proto files."
