#!/usr/bin/env node
/**
 * Prints an argon2id hash of a password, for `secrets/password-hash`
 * (docs/deployment.md). The one this process checks a sign-in attempt
 * against (auth/password.ts) — there is no user table and nothing else this
 * hashes.
 *
 * Uses `@node-rs/argon2` directly rather than shelling out to anything: it is
 * already a dependency of this workspace, with the same prebuilt bindings the
 * running process verifies against, so the hash this prints is produced the
 * same way it will be checked.
 */
import { hash } from "@node-rs/argon2";

const password = process.argv[2];
if (password === undefined || password === "") {
  console.error("usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

console.log(await hash(password));
