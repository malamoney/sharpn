# Runbook: rolling back a deploy

There is no registry and no staged/blue-green swap — the deployment artifact
is the repository checkout on the Mac and the images built from it
([ADR 0003](../adr/0003-two-hosts.md)). Rolling back is checking out an
older commit and rebuilding from it.

## Steps

1. **Find the commit to roll back to.** `git log`, or the git SHA a known-good
   deploy reported — `GET /version` on the Console API, or
   `docker inspect <image> --format '{{json .Config.Labels}}'`'s
   `org.opencontainers.image.revision`
   (`apps/console-api/Dockerfile`, `apps/console/Dockerfile`).
2. **Check out that commit:**

   ```
   git checkout <sha>
   ```

   If anything is uncommitted, `git status` first — this is the same
   discipline as anywhere else, just worth naming here because a rollback is
   exactly the moment someone is in a hurry.
3. **Rebuild and restart both containers:**

   ```
   scripts/deploy.sh
   ```

   This derives `GIT_SHA` from whatever is now checked out and
   `PROTO_REVISION` from `proto/PINNED` at that commit, and runs
   `docker compose up --build --detach` — so the rolled-back deploy reports
   its own, older, SHA from `/version` rather than the one it replaced.
4. **Confirm.** `GET /version` reports the SHA from step 2, and `GET
   /readyz` reports `channel: "connected"` and `subscription: "established"`
   (`apps/console-api/src/readiness.ts`).
5. **Return to the branch you were on**, once the rollback has done its job:

   ```
   git checkout main
   ```

   Step 2 leaves the working tree on a detached commit, not a branch — this
   step is what avoids the next commit landing nowhere.

## What this does and doesn't undo

This rebuilds both images from an older checkout; it does not touch
`secrets/`, `certs/`, or `.env`, none of which are part of the checkout
(`.gitignore`). A rollback made necessary by a bad secret or a bad
certificate is [gateway-token-rotation.md](./gateway-token-rotation.md) or
[certificate-rotation.md](./certificate-rotation.md), not this runbook. This
one is for when the code itself is what needs undoing.
