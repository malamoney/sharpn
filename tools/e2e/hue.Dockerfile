# The real Gateway (`hue-grpc`) and the fake Bridge (`fake-hue`), both built
# from the same checkout of malamoney/hue at the revision proto/PINNED names
# — see scripts/read-pinned-hue-revision.sh, which is what
# docker-compose.e2e.yml passes in as HUE_REVISION.
#
# Neither package is published anywhere; both are plain setuptools packages
# in that repository, installable once the generated protobuf code exists.
# That generated code (`src/hue/`) is gitignored upstream and only produced
# by `tools/generate-python-protos.sh` — which is why this is a source build
# rather than a `pip install git+https://...`, which would fetch a checkout
# missing the very thing setuptools needs to find.
#
# One `source` stage does the clone and codegen once; `gateway` and
# `fake-bridge` each install only the one package they need from it, so an
# image built for one never carries the other's dependencies.

FROM python:3.12-slim AS source

RUN apt-get update \
  && apt-get install --no-install-recommends -y git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG HUE_REVISION
RUN test -n "$HUE_REVISION"

WORKDIR /src
RUN git clone --quiet https://github.com/malamoney/hue.git . \
  && git checkout --quiet "$HUE_REVISION"

# grpcio-tools is generate-python-protos.sh's only dependency beyond the
# repository itself (tools/generate-python-protos.sh's own comment: "the dev
# shell's python is on PATH and has grpcio-tools").
RUN pip install --no-cache-dir grpcio-tools \
  && PYTHON=python tools/generate-python-protos.sh

FROM source AS gateway
RUN pip install --no-cache-dir .
COPY gateway-entrypoint.sh /usr/local/bin/gateway-entrypoint.sh
RUN chmod +x /usr/local/bin/gateway-entrypoint.sh
EXPOSE 50051
# A TCP probe rather than a gRPC health check: the Gateway's own health
# service is one more thing the vitest/playwright suites verify for real, and
# this only needs to know the process is up before console-api dials it.
HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD python -c "import socket; socket.create_connection(('127.0.0.1', 50051), timeout=1).close()"
ENTRYPOINT ["/usr/local/bin/gateway-entrypoint.sh"]

FROM source AS fake-bridge
RUN pip install --no-cache-dir ./tools
COPY fake-bridge-entrypoint.sh /usr/local/bin/fake-bridge-entrypoint.sh
RUN chmod +x /usr/local/bin/fake-bridge-entrypoint.sh
EXPOSE 443
# A bare TCP connect: fake-hue only starts accepting once its certificate is
# minted (tools/fake_hue/__main__.py), so this doubles as "certs are ready"
# for the gateway service's `depends_on: condition: service_healthy`.
HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD python -c "import socket; socket.create_connection(('127.0.0.1', 443), timeout=1).close()"
ENTRYPOINT ["/usr/local/bin/fake-bridge-entrypoint.sh"]
