# The Console API's image: `node:24-bookworm-slim`, not Alpine.
#
# `@node-rs/argon2` (apps/console-api/src/auth/password.ts) ships prebuilt
# native bindings for glibc targets; musl (Alpine) is the one most likely to
# have no prebuild for a given arch, which turns a `docker build` into a
# multi-minute compile or a hard failure with no native toolchain to do it
# in. The Console's image (../console/Dockerfile) has no native module and
# uses Alpine for exactly that reason, in the other direction.
#
# Built from the repository root as context — see docker-compose.yml — because
# this is an npm workspace and `npm ci` needs every workspace's package.json
# present to resolve the one lockfile, even to build only this one.
#
# GIT_SHA and PROTO_REVISION are stamped in as both a label (`docker inspect`)
# and an environment variable (`GET /version`, apps/console-api/src/version.ts)
# — see docs/deployment.md for how they're derived.

FROM node:24-bookworm-slim AS build
WORKDIR /repo

# Only what `npm ci` needs to resolve the workspace, so this layer caches
# across a source-only change.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/console-api/package.json apps/console-api/package.json
COPY apps/console/package.json apps/console/package.json
RUN npm ci --workspace=apps/console-api

COPY apps/console-api apps/console-api
RUN npm run build --workspace=apps/console-api

FROM node:24-bookworm-slim AS runtime
WORKDIR /repo

ARG GIT_SHA=unknown
ARG PROTO_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL dev.sharpn.proto-revision=$PROTO_REVISION
ENV GIT_SHA=$GIT_SHA
ENV PROTO_REVISION=$PROTO_REVISION
ENV NODE_ENV=production

# The lockfile again, so `npm ci --omit=dev` installs production dependencies
# only — none of typescript, vitest, or the other workspace's dev tooling.
# `apps/console`'s own dependencies (react, and the rest of what it ships to a
# browser) are not console-api's concern, but the npm workspace resolves one
# lockfile for both, so its package.json has to be present for `npm ci` to
# find the workspace at all; nothing from it ends up on this process's
# `require` path.
COPY package.json package-lock.json ./
COPY apps/console-api/package.json apps/console-api/package.json
COPY apps/console/package.json apps/console/package.json
RUN npm ci --omit=dev --workspace=apps/console-api

COPY --from=build /repo/apps/console-api/dist apps/console-api/dist

WORKDIR /repo/apps/console-api

# Never loopback — see server.ts's EVERY_ADDRESS comment. Only Nginx is
# published to the host; this port is reachable from the compose network
# alone.
EXPOSE 3000

# `curl`/`wget` are not in this image; Node's own `fetch` is, and is cheaper
# than adding a package for one probe. `/healthz` asks nothing of the
# Gateway (readiness.ts), so this only ever reports the process itself.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
