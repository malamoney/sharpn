#!/usr/bin/env bash
#
# Write apps/console-api/openapi.json from the Zod schemas it is generated from.
#
# The document is committed so that the Console, and anything else reading the
# contract, has a file to read rather than a build step to run. That is only
# safe while the committed copy is what the schemas render, which
# apps/console-api/src/contract/openapi.test.ts asserts on every `npm test`.
#
# The compile goes to a temporary directory rather than to dist/: generating a
# document must not leave build output behind, and must not depend on there
# being any. The directory is inside the repository because the compiled code
# imports zod, and Node looks for that by walking up from the file that
# imports it.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATH="$repo_root/node_modules/.bin:$PATH"
export PATH

destination="$repo_root/apps/console-api/openapi.json"

work="$(mktemp -d "$repo_root/.openapi.XXXXXX")"
trap 'rm -rf "$work"' EXIT

tsc --project "$repo_root/apps/console-api/tsconfig.build.json" --outDir "$work"

node "$work/contract/write-openapi.js" "$destination"
