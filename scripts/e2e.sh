#!/usr/bin/env bash
#
# The e2e Compose stack (docker-compose.e2e.yml): issue #10's layer 2 (the
# real Gateway against a fake Bridge) and layer 3 (Playwright through the
# real Nginx), both pointed at one stack rather than two.
#
#   scripts/e2e.sh up        # mint secrets, build, wait for every healthcheck
#   scripts/e2e.sh logs      # one-shot dump; `scripts/e2e.sh logs -f` follows
#   scripts/e2e.sh down

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

compose=(docker compose -f docker-compose.e2e.yml)

# docker-compose.e2e.yml interpolates these into build.args for every
# subcommand, `down` and `logs` included — Compose parses the whole file
# before it knows which service the subcommand is even about.
export HUE_REVISION
HUE_REVISION="$(scripts/read-pinned-hue-revision.sh)"
export BRIDGE_ID="ECB5FAFFFE334703"

usage() {
  echo "usage: $(basename "$0") {up|down|logs [-f]}" >&2
  exit 2
}

[ "$#" -ge 1 ] || usage

case "$1" in
  up)
    scripts/e2e-secrets.sh

    # --wait blocks until every service with a HEALTHCHECK reports healthy
    # (or fails fast if one doesn't) rather than handing back a stack that
    # is still starting.
    "${compose[@]}" up --build --detach --wait
    ;;
  down)
    "${compose[@]}" down --volumes
    ;;
  logs)
    shift
    "${compose[@]}" logs "$@"
    ;;
  *)
    usage
    ;;
esac
