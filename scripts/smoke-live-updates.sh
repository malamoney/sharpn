#!/usr/bin/env bash
#
# Prove that a change to a Light reaches a browser's event stream, on the
# deployment docker-compose.yml is running right now.
#
#   scripts/smoke-live-updates.sh                 # first Light listed
#   LIGHT_ID=<id> scripts/smoke-live-updates.sh   # a particular one
#
# Copies scripts/smoke-live-updates.mjs into the console-api container and
# runs it there — see that file for why there and what it checks. Exit 0 is
# green; exit 1 is red, and the last line printed says which of the two
# things it asked for did not happen. One bulb blinks for about a second.
#
# Worth running after every scripts/deploy.sh, and whenever the Console seems
# to have stopped following changes made in the Hue app: `/readyz` cannot
# tell a live subscription from one to a Gateway that has itself gone deaf
# (docs/runbooks/live-updates-stopped.md).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

probe=/tmp/smoke-live-updates.mjs

docker compose cp scripts/smoke-live-updates.mjs "console-api:$probe"
docker compose exec \
  -e "LIGHT_ID=${LIGHT_ID:-}" \
  -e "WAIT_MS=${WAIT_MS:-5000}" \
  console-api node "$probe"
