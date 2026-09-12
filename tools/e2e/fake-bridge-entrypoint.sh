#!/usr/bin/env sh
#
# Starts the fake Bridge. It mints its own CA and Bridge-shaped leaf
# certificate into --cert-dir on first start — a named volume shared with the
# `gateway` service (docker-compose.e2e.yml), which reads ca.pem from it to
# verify this container the same way it would verify a real Bridge.

set -eu

exec fake-hue \
  --bridge-id "${BRIDGE_ID}" \
  --application-key-file /run/secrets/bridge-application-key \
  --cert-dir /var/lib/fake-hue/certs \
  --listen-address 0.0.0.0 \
  --port 443
