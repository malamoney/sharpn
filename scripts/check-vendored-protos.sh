#!/usr/bin/env bash
#
# Fail if proto/hue/v1 differs from the revision proto/PINNED names.
#
# The vendored copy is the one the bindings are generated from, so a local edit
# to it is a fork of the Gateway's contract that nothing else would notice.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

"$repo_root/scripts/fetch-pinned-protos.sh" "$work/v1"

if ! diff --recursive --unified "$work/v1" "$repo_root/proto/hue/v1"; then
  cat >&2 <<'MESSAGE'

proto/hue/v1 does not match the revision in proto/PINNED.

The diff above reads: pinned revision on the left, vendored copy on the right.
Either the vendored files were edited here — change them upstream instead — or
proto/PINNED was moved without re-vendoring. To take the pinned revision as it
stands:

    npm run proto:vendor && npm run proto:generate
MESSAGE
  exit 1
fi

echo "proto/hue/v1 matches the revision in proto/PINNED."
