import { describe, expect, it } from "vitest";

import { LIGHT_ARCHETYPES } from "../api/types.js";
import { ICON_BUCKETS, iconBucketFor } from "./archetypeIcon.js";

describe("mapping archetypes to icon buckets", () => {
  it("gives every one of the 50 archetype values a bucket", () => {
    for (const archetype of LIGHT_ARCHETYPES) {
      expect(ICON_BUCKETS).toContain(iconBucketFor(archetype));
    }
  });

  it("draws a generic bulb for an archetype the Console does not recognise", () => {
    // The one thing a firmware newer than this build can produce: an
    // archetype string this Console has never seen. Drawn as `default`
    // rather than crashing or drawing nothing.
    expect(iconBucketFor("unspecified")).toBe("default");
  });

  it("puts a plug in its own bucket rather than lumping it in with lamps", () => {
    expect(iconBucketFor("plug")).toBe("plug");
  });

  it("distinguishes a spot from a strip from a ceiling fixture", () => {
    expect(iconBucketFor("single_spot")).toBe("spot");
    expect(iconBucketFor("hue_lightstrip")).toBe("strip");
    expect(iconBucketFor("ceiling_round")).toBe("ceiling");
  });
});
