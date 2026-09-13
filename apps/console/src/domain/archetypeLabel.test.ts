import { describe, expect, it } from "vitest";

import { archetypeLabel } from "./archetypeLabel.js";

describe("reading an archetype as a label", () => {
  it("sentence-cases an ordinary fitting", () => {
    expect(archetypeLabel("classic_bulb")).toBe("Classic bulb");
    expect(archetypeLabel("recessed_ceiling")).toBe("Recessed ceiling");
  });

  it("keeps Hue product names and their initialisms as written", () => {
    expect(archetypeLabel("hue_go")).toBe("Hue Go");
    expect(archetypeLabel("hue_lightstrip_tv")).toBe("Hue Lightstrip TV");
    expect(archetypeLabel("hue_lightstrip_pc")).toBe("Hue Lightstrip PC");
  });

  it("calls a Light with no fitting named just a light", () => {
    expect(archetypeLabel("unspecified")).toBe("Light");
    expect(archetypeLabel("unknown_archetype")).toBe("Light");
  });
});
