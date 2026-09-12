# Nginx serves the Console's build and is the only container the host
# publishes a port to (docker-compose.yml). No native module here, so Alpine
# is fine — unlike the Console API's image (../console-api/Dockerfile), which
# avoids it for `@node-rs/argon2`'s sake.
#
# Built from the repository root as context, for the same reason the Console
# API's Dockerfile is: one npm workspace, one lockfile, every workspace's
# package.json has to be present for `npm ci` to resolve it.

FROM node:24-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/console/package.json apps/console/package.json
COPY apps/console-api/package.json apps/console-api/package.json
RUN npm ci --workspace=apps/console

COPY apps/console apps/console
RUN npm run build --workspace=apps/console

FROM nginx:1.27-alpine AS runtime

ARG GIT_SHA=unknown
ARG PROTO_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL dev.sharpn.proto-revision=$PROTO_REVISION

COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/console/dist /usr/share/nginx/html

# TLS material is mounted at run time (docker-compose.yml, docs/deployment.md
# on `mkcert`), never baked in: a certificate belongs to whichever Mac is
# running the container this week, not to the image.
EXPOSE 80 443

# Alpine's own busybox `wget`, so nothing extra is installed for one probe.
# `--no-check-certificate` because the certificate mounted in is self-signed
# by design (mkcert's root is trusted by browsers on this LAN, not by this
# container), and this probe only cares that Nginx answers.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-check-certificate -q -O /dev/null https://127.0.0.1/ || exit 1
