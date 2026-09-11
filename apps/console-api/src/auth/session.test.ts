/**
 * The signed cookie, driven by a clock the test owns.
 *
 * The same reasoning as `meter.test.ts`'s: what is being asserted is
 * arithmetic about time passing — when a cookie stops verifying, and that
 * renewing one slides its expiry forward — and moving a global clock to ask
 * that is a test about timers rather than about sessions.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readSessionSecret, SESSION_DURATION_MS, sessionsSignedWith } from "./session.js";

/** A fresh temp file holding `contents`, for the one test that reads one. */
async function fileHolding(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sharpn-session-secret-"));
  const file = join(dir, "session-secret");
  await writeFile(file, contents);
  return file;
}

/** A clock that starts at a round number and only moves when told to. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000_000;

  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

describe("a minted session", () => {
  it("verifies back to the session it minted", () => {
    const sessions = sessionsSignedWith("a-secret", clock().now);

    const { value, session } = sessions.mint();

    expect(sessions.verify(value)).toEqual(session);
  });

  it("expires thirty days out", () => {
    const time = clock();
    const sessions = sessionsSignedWith("a-secret", time.now);
    const { session } = sessions.mint();

    expect(session.expiresAt).toBe(time.now() + SESSION_DURATION_MS);
  });

  it("is a fresh id each time, so two sessions are distinguishable", () => {
    const sessions = sessionsSignedWith("a-secret", clock().now);

    const one = sessions.mint();
    const another = sessions.mint();

    expect(one.session.id).not.toBe(another.session.id);
  });
});

describe("verifying a cookie", () => {
  it("rejects one signed with a different secret", () => {
    const minted = sessionsSignedWith("secret-one", clock().now).mint();
    const verifier = sessionsSignedWith("secret-two", clock().now);

    expect(verifier.verify(minted.value)).toBeUndefined();
  });

  it("rejects one that has been tampered with", () => {
    const sessions = sessionsSignedWith("a-secret", clock().now);
    const { value } = sessions.mint();
    const tampered = value.replace(/\.[^.]+$/, ".not-the-session-id");

    expect(sessions.verify(tampered)).toBeUndefined();
  });

  it("rejects nonsense that never was a cookie", () => {
    const sessions = sessionsSignedWith("a-secret", clock().now);

    for (const nonsense of ["", "not-a-cookie", "a.b", "a.b.c.d"]) {
      expect(sessions.verify(nonsense)).toBeUndefined();
    }
  });

  it("rejects one that has expired", () => {
    const time = clock();
    const sessions = sessionsSignedWith("a-secret", time.now);
    const { value } = sessions.mint();

    time.advance(SESSION_DURATION_MS);

    expect(sessions.verify(value)).toBeUndefined();
  });

  it("accepts one a millisecond before it expires", () => {
    const time = clock();
    const sessions = sessionsSignedWith("a-secret", time.now);
    const { value } = sessions.mint();

    time.advance(SESSION_DURATION_MS - 1);

    expect(sessions.verify(value)).toBeDefined();
  });
});

describe("renewing a session", () => {
  it("slides the expiry forward from now, not from when it was minted", () => {
    const time = clock();
    const sessions = sessionsSignedWith("a-secret", time.now);
    const { session } = sessions.mint();

    time.advance(SESSION_DURATION_MS / 2);
    const renewed = sessions.renew(session);

    expect(renewed.session.expiresAt).toBe(time.now() + SESSION_DURATION_MS);
  });

  it("keeps the same id, so it is still the same browser's session", () => {
    const sessions = sessionsSignedWith("a-secret", clock().now);
    const { session } = sessions.mint();

    const renewed = sessions.renew(session);

    expect(renewed.session.id).toBe(session.id);
  });

  it("verifies to the renewed session, not the one it replaced", () => {
    const time = clock();
    const sessions = sessionsSignedWith("a-secret", time.now);
    const { session } = sessions.mint();

    time.advance(SESSION_DURATION_MS - 1);
    const renewed = sessions.renew(session);
    time.advance(SESSION_DURATION_MS - 1);

    // The original would have expired by now; the renewal is why it has not.
    expect(sessions.verify(renewed.value)).toEqual(renewed.session);
  });
});

describe("the session secret", () => {
  it("is the file's contents, less a trailing newline", async () => {
    const file = await fileHolding("a-signing-secret\n");

    expect(readSessionSecret(file)).toBe("a-signing-secret");
  });

  it("refuses an empty file", async () => {
    const file = await fileHolding("\n");

    expect(() => readSessionSecret(file)).toThrow(/empty/);
  });
});
