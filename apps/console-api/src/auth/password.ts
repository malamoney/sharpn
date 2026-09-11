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
 * The hash, less whatever the file ends with.
 *
 * The same reasoning as the Gateway Token's `readToken`: a hash written by a
 * person or by `echo` ends in a newline, and argon2's own encoding has no use
 * for one. An empty file is refused here, at startup, rather than at the
 * first login attempt — which would otherwise refuse every password with the
 * same 401 a wrong one gets, and look like a browser problem rather than a
 * deployment one.
 */
function readHash(file: string): string {
  const hash = readFileSync(file, "utf8").trim();
  if (hash === "") {
    throw new Error(`the password hash file ${file} is empty`);
  }

  return hash;
}
