/**
 * The one password, checked against an argon2id hash this process reads once
 * at startup.
 *
 * `@node-rs/argon2` rather than `argon2`: the latter goes through
 * node-gyp/prebuild-install, and an arm64 image build with no prebuild
 * available turns into a silent multi-minute compile. There is no user table
 * to look a hash up in — one password, one hash, one file — so there is
 * nothing here for a route to pass an identity into.
 */
import { readFileSync } from "node:fs";
import { verify } from "@node-rs/argon2";

/** Whether a candidate password is the one this process was deployed with. */
export interface PasswordCheck {
  matches(candidate: string): Promise<boolean>;
}

/** A check against the argon2id hash in `hashFile`, read once. */
export function passwordCheckFrom(hashFile: string): PasswordCheck {
  const hash = readHash(hashFile);

  return {
    matches(candidate) {
      return verify(hash, candidate);
    },
  };
}

/**
 * What every encoded argon2 hash begins with — `$argon2id$`, `$argon2i$` or
 * `$argon2d$` — which is the one thing about the file's contents this
 * process can check without a password to check them against.
 */
const ARGON2_PREFIX = /^\$argon2(id|i|d)\$/;

/**
 * The hash, less whatever the file ends with.
 *
 * The same reasoning as the Gateway Token's `readToken`: a hash written by a
 * person or by `echo` ends in a newline, and argon2's own encoding has no use
 * for one. An empty file is refused here, at startup, rather than at the
 * first login attempt — which would otherwise refuse every password with the
 * same 401 a wrong one gets, and look like a browser problem rather than a
 * deployment one.
 *
 * A file that is not empty and not a hash is refused for the same reason,
 * and it is not a hypothetical: `npm run hash-password -- '…' > file` writes
 * npm's own banner ahead of the script's output, and a file that begins
 * `> @sharpn/console-api@0.0.0 hash-password` is one `verify` throws on —
 * which reaches a browser as a bare 500 with no code, and looks like a bug
 * in this process rather than the deployment fault it is.
 */
function readHash(file: string): string {
  const hash = readFileSync(file, "utf8").trim();
  if (hash === "") {
    throw new Error(`the password hash file ${file} is empty`);
  }

  // What the file does begin with is deliberately not quoted: a file that
  // holds the password itself, rather than its hash, is one of the ways to
  // get here, and the first thing this process would do with it is log it.
  if (!ARGON2_PREFIX.test(hash)) {
    throw new Error(
      `the password hash file ${file} does not begin with $argon2id$, so ` +
        "it is not the hash scripts/hash-password.mjs prints. Write only " +
        "that — with node, not npm run, whose banner lands in the file " +
        "ahead of the hash",
    );
  }

  return hash;
}
