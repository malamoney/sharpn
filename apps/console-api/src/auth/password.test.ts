/**
 * The password check, against a real argon2id hash.
 *
 * Real rather than stood in: what is worth proving here is that this process
 * reads the same encoding `@node-rs/argon2`'s own hasher produces and rejects
 * everything else, and a stand-in that always answers `true` or `false` would
 * prove nothing about the file this reads.
 */
import { hash } from "@node-rs/argon2";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { passwordCheckFrom } from "./password.js";

/** A hash file holding `password`'s argon2id hash, as an operator would set one up. */
async function hashFileFor(password: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sharpn-password-hash-"));
  const file = join(dir, "password-hash");
  await writeFile(file, `${await hash(password)}\n`);
  return file;
}

describe("a password check", () => {
  it("matches the password its hash was made from", async () => {
    const check = passwordCheckFrom(await hashFileFor("the-shared-password"));

    expect(await check.matches("the-shared-password")).toBe(true);
  });

  it("does not match a different password", async () => {
    const check = passwordCheckFrom(await hashFileFor("the-shared-password"));

    expect(await check.matches("a-guess")).toBe(false);
  });

  it("does not match the empty string against a real hash", async () => {
    const check = passwordCheckFrom(await hashFileFor("the-shared-password"));

    expect(await check.matches("")).toBe(false);
  });

  it("refuses an empty hash file at startup, not at the first login", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sharpn-password-hash-"));
    const file = join(dir, "password-hash");
    await writeFile(file, "\n");

    expect(() => passwordCheckFrom(file)).toThrow(/empty/);
  });

  it("refuses a file that holds npm's banner ahead of the hash", async () => {
    // What `npm run hash-password -- '…' > file` actually writes: two lines
    // of banner, the second quoting the password, and then the hash.
    // `verify` throws on this, and without the check at startup that throw
    // reached a browser as a bare 500 at the first login.
    const file = await fileHolding(
      "> @sharpn/console-api@0.0.0 hash-password\n" +
        "> node scripts/hash-password.mjs the-shared-password\n\n" +
        `${await hash("the-shared-password")}\n`,
    );

    expect(() => passwordCheckFrom(file)).toThrow(/does not begin with \$argon2id\$/);
  });

  it("refuses a file that holds something other than a hash, without quoting it", async () => {
    const file = await fileHolding("the-shared-password\n");

    expect(() => passwordCheckFrom(file)).toThrow(/does not begin with \$argon2id\$/);
    expect(() => passwordCheckFrom(file)).not.toThrow(/the-shared-password/);
  });

  it("accepts a hash however the file around it is padded", async () => {
    const file = await fileHolding(`\n  ${await hash("the-shared-password")}  \n\n`);
    const check = passwordCheckFrom(file);

    expect(await check.matches("the-shared-password")).toBe(true);
  });
});

/** A hash file holding exactly `contents`, however malformed. */
async function fileHolding(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sharpn-password-hash-"));
  const file = join(dir, "password-hash");
  await writeFile(file, contents);
  return file;
}
