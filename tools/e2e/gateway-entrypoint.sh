#!/usr/bin/env sh
#
# Starts the real Gateway, statically configured against the fake Bridge —
# no pairing, which has a thirty-second link-button window nothing in a
# container can press. See docker-compose.e2e.yml for where every path here
# is mounted from.

set -eu

exec hue-grpc-server \
  --listen-address 0.0.0.0 \
  --port 50051 \
  --tls-certificate-file /run/secrets/gateway-certificate \
  --tls-private-key-file /run/secrets/gateway-private-key \
  --gateway-token-file /run/secrets/gateway-token \
  --bridge-address "${BRIDGE_ADDRESS}" \
  --bridge-id "${BRIDGE_ID}" \
  --credentials-file /run/secrets/bridge-credentials \
  --bridge-ca-file /var/lib/fake-hue/certs/ca.pem
