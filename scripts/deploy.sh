#!/usr/bin/env bash
#
# Build and (re)start both containers, stamped with which checkout this is.
#
# `docker compose up --build` alone leaves GIT_SHA and PROTO_REVISION unset,
# and an image built that way reports "unknown" from `/version` — true, and
# not the answer anyone wants to see on a Mac that is meant to be running a
# release. This derives both from the checkout `docker-compose.yml` is run
# from, the same pair docs/runbooks/rollback.md's `git checkout <sha>` puts
# in place before this script runs again.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export GIT_SHA
GIT_SHA="$(git rev-parse --short HEAD)"

export PROTO_REVISION
PROTO_REVISION="$(awk -F= '/^revision=/ { print substr($2, 1, 7) }' proto/PINNED)"

echo "building GIT_SHA=$GIT_SHA PROTO_REVISION=$PROTO_REVISION"
docker compose up --build --detach

echo
echo "Console API is not published to the host (docker-compose.yml); check"
echo "which checkout it's running from inside the network instead:"
echo "  docker compose exec console-api node -e \"fetch('http://localhost:3000/version').then(r=>r.json()).then(console.log)\""
