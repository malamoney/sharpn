/**
 * What a request body is allowed to ask for, and what it is refused for.
 *
 * These are the update semantics from issue #2, asserted at the one seam a
 * route has: `readLightCommand`, which either yields a Command or names the
 * error code the refusal is reported under.
 */
import { describe, expect, it } from "vitest";

import { lightCommandSchema, readLightCommand } from "./command.js";

describe("readLightCommand", () => {
  it("keeps only the keys the body actually carries", () => {
    const reading = readLightCommand({ brightness: 42 });

    expect(reading).toEqual({ ok: true, command: { brightness: 42 } });
  });

  it("refuses null rather than reading it as absent", () => {
    const reading = readLightCommand({ brightness: null });

    expect(reading.ok).toBe(false);
    expect(reading).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("keeps an explicit false, which is a light being turned off", () => {
    const reading = readLightCommand({ on: false });

    expect(reading).toEqual({ ok: true, command: { on: false } });
  });

  it("keeps a brightness of zero: a lit light dimmed to nothing", () => {
    const reading = readLightCommand({ on: true, brightness: 0 });

    expect(reading).toEqual({ ok: true, command: { on: true, brightness: 0 } });
  });
});

/**
 * Every bound here is the Gateway's `limits.py`, which copied it from Hue's
 * own document, and both ends are inclusive there. A bound the Console API
 * does not share with the Gateway would reject a request the Bridge accepts.
 */
describe("readLightCommand bounds", () => {
  it("accepts both ends of every range", () => {
    for (const command of [
      { brightness: 0 },
      { brightness: 100 },
      { colorTemperatureMirek: 153 },
      { colorTemperatureMirek: 500 },
      { colorXy: { x: 0, y: 0 } },
      { colorXy: { x: 1, y: 1 } },
    ]) {
      expect(readLightCommand(command)).toEqual({ ok: true, command });
    }
  });

  it("refuses a number outside one", () => {
    for (const command of [
      { brightness: -0.5 },
      { brightness: 100.5 },
      { colorTemperatureMirek: 152 },
      { colorTemperatureMirek: 501 },
      { colorXy: { x: -0.1, y: 0.5 } },
      { colorXy: { x: 0.5, y: 1.1 } },
    ]) {
      expect(readLightCommand(command)).toMatchObject({
        ok: false,
        code: "INVALID_REQUEST",
      });
    }
  });

  it("keeps a fractional brightness, which Hue's own dimming is", () => {
    expect(readLightCommand({ brightness: 42.5 })).toEqual({
      ok: true,
      command: { brightness: 42.5 },
    });
  });

  it("refuses a fractional mirek, which Hue's is not", () => {
    expect(readLightCommand({ colorTemperatureMirek: 366.5 })).toMatchObject({
      ok: false,
      code: "INVALID_REQUEST",
    });
  });

  it("refuses a key it does not recognise, rather than dropping it", () => {
    // A typo that is quietly ignored is a person watching a light not change
    // and a log full of successful requests.
    expect(readLightCommand({ on: true, britghtness: 42 })).toMatchObject({
      ok: false,
      code: "INVALID_REQUEST",
    });
    expect(
      readLightCommand({ colorXy: { x: 0.5, y: 0.5, z: 1 } }),
    ).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });
});

/**
 * ADR 0005's second guard. `LightPut.colour` is a protobuf oneof, so a Command
 * carrying both is not refused by the wire format — it is quietly narrowed to
 * whichever was written last, and a person who asked for warm white gets a
 * colour with every log line recording a success. The type guard from #1
 * cannot see a JSON body, so this one is what a body meets.
 */
describe("readLightCommand and the colour oneof", () => {
  const bothSet = { colorXy: { x: 0.17, y: 0.7 }, colorTemperatureMirek: 366 };

  it("refuses a colour and a colour temperature in one Command", () => {
    expect(readLightCommand(bothSet)).toMatchObject({
      ok: false,
      code: "COLOR_AND_TEMPERATURE_BOTH_SET",
    });
  });

  it("refuses it in the schema too, not only in the reader", () => {
    // The guard belongs to the schema so that every use of it carries the
    // guard — including the ones written after this file.
    expect(lightCommandSchema.safeParse(bothSet).success).toBe(false);
  });

  it("takes either one alone", () => {
    expect(readLightCommand({ colorXy: { x: 0.17, y: 0.7 } }).ok).toBe(true);
    expect(readLightCommand({ colorTemperatureMirek: 366 }).ok).toBe(true);
  });
});

describe("readLightCommand and a Command that asks for nothing", () => {
  it("refuses an empty body", () => {
    // Not a rule invented here: the Gateway aborts an empty command with
    // INVALID_ARGUMENT before it reaches the Bridge, because a PUT of `{}` is
    // answered cheerfully and changes nothing. This refuses it one tier
    // earlier and in the same terms.
    expect(readLightCommand({})).toMatchObject({
      ok: false,
      code: "INVALID_REQUEST",
    });
  });

  it("refuses a body that is not an object at all", () => {
    for (const body of [null, undefined, 7, "on", [], true]) {
      expect(readLightCommand(body)).toMatchObject({
        ok: false,
        code: "INVALID_REQUEST",
      });
    }
  });
});
