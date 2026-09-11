/**
 * What the generated bindings have to keep being.
 *
 * These assert on the shapes the codegen flags in buf.gen.yaml produce, rather
 * than on anything this project wrote. ts-proto's defaults are different, so
 * reverting a flag fails them — which is the point, and is why they exist
 * alongside scripts/check-codegen-flags.sh rather than being replaced by it.
 * That script names the cause and fails first; these catch the consequence,
 * and would still catch it if the flag were reverted some other way.
 *
 * The third case is the odd one, and deliberate: it asserts on protobuf's own
 * wire behaviour rather than on a generated type. It is the only one of these
 * that fails under `npm test` as well as under `tsc`, and it is the evidence
 * for ADR 0005's claim that the hazard is real rather than theoretical.
 */
import { describe, expect, it } from "vitest";

import type { Color, ColorTemperature } from "./gen/hue/v1/common.js";
import { LightPut } from "./gen/hue/v1/lighting.js";
import {
  LightingServiceClient,
  LightingServiceService,
} from "./gen/hue/v1/lighting_service.js";

const warmWhite: ColorTemperature = { mirek: 366 };
const green: Color = { xy: { x: 0.17, y: 0.7 } };

describe("LightPut.colour (oneof=unions)", () => {
  it("names which of the two a Command carries", () => {
    const command: LightPut = { colour: { $case: "color", color: green } };

    expect(command.colour).toEqual({ $case: "color", color: green });
  });

  it("cannot be given both, because there are no flat fields to give", () => {
    // @ts-expect-error This is the ts-proto default (oneof=properties) shape:
    // two optional fields, either of which may be set, both of which may be
    // set at once. If this line ever compiles, the flag has been lost and the
    // unused-directive error below is the warning. See
    // docs/adr/0005-colour-exclusivity-guarded-twice.md.
    const command: LightPut = { color: green, colorTemperature: warmWhite };

    // Reached only if the directive above did not fire, which the compiler
    // will already have refused. Asserting on it keeps the binding used.
    expect(command).toBeDefined();
  });

  it("is narrowed silently by the wire format when a message carries both", () => {
    // Not a hypothetical: concatenating two encodings is exactly what a
    // serialized message with both members set looks like. protobuf accepts
    // it and keeps the last — no error, no warning, a well-formed message
    // that means something other than what was asked for. The type guard
    // above is why the Console API cannot build this one; ADR 0005's second
    // guard, at the HTTP boundary, is why it cannot be asked to.
    const asColour = LightPut.encode({
      colour: { $case: "color", color: green },
    }).finish();
    const asTemperature = LightPut.encode({
      colour: { $case: "colorTemperature", colorTemperature: warmWhite },
    }).finish();

    const both = new Uint8Array([...asColour, ...asTemperature]);

    expect(LightPut.decode(both).colour).toEqual({
      $case: "colorTemperature",
      colorTemperature: warmWhite,
    });
  });
});

describe("LightingService (outputServices=grpc-js)", () => {
  it("generates a typed client and a service definition", () => {
    expect(typeof LightingServiceClient).toBe("function");
    expect(LightingServiceService.listLights.path).toBe(
      "/hue.v1.LightingService/ListLights",
    );
  });
});
