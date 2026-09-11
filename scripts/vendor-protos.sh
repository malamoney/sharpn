#!/usr/bin/env bash
#
# Replace proto/hue/v1 with the pinned revision's copy.
#
# Run this after moving `revision` in proto/PINNED. It rewrites the vendored
# files in place; `git diff` afterwards is the change being taken on.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$repo_root/scripts/fetch-pinned-protos.sh" "$repo_root/proto/hue/v1"

echo "proto/hue/v1 now matches the revision in proto/PINNED."
echo "Regenerate the bindings with \`npm run proto:generate\`."
