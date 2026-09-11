#!/usr/bin/env bash
#
# Download the .proto files named by proto/PINNED into a directory.
#
#   scripts/fetch-pinned-protos.sh <destination>
#
# The destination is replaced, not merged, so a file that has been deleted
# upstream is absent afterwards rather than left behind. That is what makes the
# caller's `diff` trustworthy in both directions.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pinned_file="$repo_root/proto/PINNED"

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <destination>" >&2
  exit 2
fi
destination="$1"

# The destination is deleted further down, so refuse the two arguments that
# would make that catastrophic rather than merely wrong.
case "$destination" in
  "" | "/")
    echo "refusing to replace '${destination}'" >&2
    exit 2
    ;;
esac

# Read one `key=value` line from proto/PINNED, ignoring comments and blanks.
# This cannot report its own failure: it is called in a command substitution,
# where an `exit` would leave the subshell and not this script. The caller
# checks for an empty value instead.
pinned() {
  sed -n "s/^${1}=//p" "$pinned_file"
}

repo="$(pinned repo)"
revision="$(pinned revision)"
path="$(pinned path)"

for pair in "repo=${repo}" "revision=${revision}" "path=${path}"; do
  if [ -z "${pair#*=}" ]; then
    echo "$pinned_file does not set ${pair%%=*}=" >&2
    exit 1
  fi
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# A tarball rather than one request per file: a .proto added upstream has to
# appear in the download, or the caller's diff would report "unchanged" for a
# vendored copy that is missing a file.
tarball="$work/pinned.tar.gz"
if ! curl --fail --silent --show-error --location \
  "https://codeload.github.com/${repo}/tar.gz/${revision}" --output "$tarball"; then
  cat >&2 <<MESSAGE

Could not download ${repo}@${revision}.

proto/PINNED names a revision the repository does not have — a typo, or a
commit that only exists locally — or the network is unavailable. curl's own
error is above.
MESSAGE
  exit 1
fi

tar -xzf "$tarball" -C "$work"

extracted="$work/$(basename "$repo")-${revision}/${path}"
if [ ! -d "$extracted" ]; then
  echo "${repo}@${revision} has no ${path}/" >&2
  exit 1
fi

rm -rf "$destination"
mkdir -p "$(dirname "$destination")"
cp -R "$extracted" "$destination"
