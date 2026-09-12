#!/usr/bin/env bash
#
# Print the revision of malamoney/hue that proto/PINNED names.
#
#   scripts/read-pinned-hue-revision.sh
#
# proto/PINNED is the one place that revision is written down — for the
# vendored .proto files, and, from here, for the e2e Compose stack's real
# Gateway and fake Bridge images too. Reading it rather than repeating it
# keeps both in step: a `npm run proto:vendor` bump moves the e2e stack's
# revision along with it, with nothing else to remember to edit.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sed -n 's/^revision=//p' "$repo_root/proto/PINNED"
