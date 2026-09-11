/**
 * Which version is running.
 *
 * There is no registry, so the deployment artifact is a checkout on the Mac
 * and an image built from it (ADR 0003). The git SHA and the revision the
 * Gateway's contract is vendored from are therefore the whole answer to "which
 * version is running", and without them there is no answer at all — `latest`
 * is not one.
 *
 * Both are stamped in at build time and read once at startup. Read from the
 * environment rather than from the files they came from, because the runtime
 * image carries `dist` and its dependencies and neither `.git` nor
 * `proto/PINNED` is in it.
 */
export interface Version {
  /** The commit the checkout this was built from was at. */
  sha: string;
  /** The revision of the Gateway's contract the bindings came from. */
  proto: string;
}
