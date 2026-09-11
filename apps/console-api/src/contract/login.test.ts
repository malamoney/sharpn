import { describe, expect, it } from "vitest";

import { readLoginCommand } from "./login.js";

describe("readLoginCommand", () => {
  it("reads a password", () => {
    expect(readLoginCommand({ password: "the-shared-password" })).toEqual({
      ok: true,
      command: { password: "the-shared-password" },
    });
  });

  it("refuses an empty password", () => {
    expect(readLoginCommand({ password: "" })).toMatchObject({ ok: false });
  });

  it("refuses a key it does not recognise, rather than dropping it", () => {
    expect(
      readLoginCommand({ password: "the-shared-password", remember: true }),
    ).toMatchObject({ ok: false });
  });

  it("refuses a body that is not an object at all", () => {
    for (const body of [null, undefined, 7, "the-shared-password", [], true]) {
      expect(readLoginCommand(body)).toMatchObject({ ok: false });
    }
  });
});
