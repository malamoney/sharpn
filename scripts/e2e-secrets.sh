#!/usr/bin/env bash
#
# Mints everything docker-compose.e2e.yml's secrets: block reads from — fresh
# per checkout, never committed (.gitignore covers .e2e/), and idempotent:
# re-running this with a stack already up does not rotate anything out from
# under it.
#
#   scripts/e2e-secrets.sh
#
# Six things, in three shapes:
#   - the gateway<->console-api gRPC TLS pair, self-signed and pinned rather
#     than CA-issued — the same shape adapter.test.ts mints for its in-process
#     fake Gateway, and the one docs/adr/0004-self-signed-pinned-no-ca.md
#     describes for the real deployment.
#   - three bearer secrets (gateway token, bridge application key, the
#     credentials file hue-grpc-server --credentials-file wants, which is the
#     application key again under a key=value line).
#   - the Console API's own two (a password hash and a session-signing
#     secret), minted the same way docs/deployment.md walks a real deploy
#     through.
#
# The plaintext password is written alongside its hash so apps/e2e's tests can
# log in with it; it is not mounted into any container.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
certs_dir="$repo_root/.e2e/certs"
secrets_dir="$repo_root/.e2e/secrets"

mkdir -p "$certs_dir" "$certs_dir/nginx" "$secrets_dir"

random_token() {
  openssl rand -hex 32
}

write_if_absent() {
  local file="$1"
  shift
  if [ ! -f "$file" ]; then
    "$@" > "$file"
    echo "wrote $file"
  fi
}

# The gateway<->console-api leg. One name, no authority: the certificate is
# trusted by exactly the one client that pins it, which is cheap to mint per
# run and leaves no key in the repository — ADR 0004's arrangement.
if [ ! -f "$certs_dir/gateway-cert.pem" ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$certs_dir/gateway-key.pem" -out "$certs_dir/gateway-cert.pem" \
    -days 2 -subj "/CN=gateway" -addext "subjectAltName=DNS:gateway"
  echo "wrote $certs_dir/gateway-cert.pem and gateway-key.pem"
fi

# Nginx's own TLS, for `https://localhost` — self-signed and untrusted by
# design; apps/e2e/playwright.config.ts sets ignoreHTTPSErrors rather than
# minting a CA nobody would trust for a throwaway stack.
if [ ! -f "$certs_dir/nginx/fullchain.pem" ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$certs_dir/nginx/privkey.pem" -out "$certs_dir/nginx/fullchain.pem" \
    -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"
  echo "wrote $certs_dir/nginx/fullchain.pem and privkey.pem"
fi

write_if_absent "$secrets_dir/gateway-token" random_token
write_if_absent "$secrets_dir/bridge-application-key" random_token

if [ ! -f "$secrets_dir/bridge-credentials" ]; then
  printf 'application-key=%s\n' "$(cat "$secrets_dir/bridge-application-key")" \
    > "$secrets_dir/bridge-credentials"
  echo "wrote $secrets_dir/bridge-credentials"
fi

write_if_absent "$secrets_dir/session-secret" random_token

E2E_PASSWORD="sharpn-e2e-test-password"
write_if_absent "$secrets_dir/password" echo "$E2E_PASSWORD"

if [ ! -f "$secrets_dir/password-hash" ]; then
  (
    cd "$repo_root"
    npm run --silent hash-password --workspace=apps/console-api -- "$E2E_PASSWORD"
  ) > "$secrets_dir/password-hash"
  echo "wrote $secrets_dir/password-hash"
fi

echo "e2e secrets are in place under $repo_root/.e2e"
