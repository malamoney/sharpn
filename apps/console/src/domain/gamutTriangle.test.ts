import { describe, expect, it } from "vitest";

import { clampToGamut, GAMUT_C } from "./gamutTriangle.js";

describe("clamping a point into a gamut triangle", () => {
  it("leaves a point inside the triangle exactly where it was", () => {
    const centroid = {
      x: (GAMUT_C.red.x + GAMUT_C.green.x + GAMUT_C.blue.x) / 3,
      y: (GAMUT_C.red.y + GAMUT_C.green.y + GAMUT_C.blue.y) / 3,
    };

    expect(clampToGamut(centroid, GAMUT_C)).toEqual(centroid);
  });

  it("leaves a corner exactly where it was", () => {
    expect(clampToGamut(GAMUT_C.red, GAMUT_C)).toEqual(GAMUT_C.red);
  });

  it("moves a point outside the triangle onto its boundary", () => {
    // Every reachable point is a colour the bulb can actually produce, so a
    // point outside the triangle is never returned unchanged.
    const outside = { x: 1, y: 1 };

    const clamped = clampToGamut(outside, GAMUT_C);

    expect(clamped).not.toEqual(outside);
    expect(isInsideOrOnTriangle(clamped, GAMUT_C)).toBe(true);
  });

  it("moves a point on the wrong side of one edge to that edge, not past a corner", () => {
    // Just outside the red-green edge, roughly abreast of the edge's
    // midpoint rather than off past either corner.
    const midpoint = {
      x: (GAMUT_C.red.x + GAMUT_C.green.x) / 2,
      y: (GAMUT_C.red.y + GAMUT_C.green.y) / 2,
    };
    const outside = { x: midpoint.x + 0.05, y: midpoint.y + 0.05 };

    const clamped = clampToGamut(outside, GAMUT_C);

    expect(isInsideOrOnTriangle(clamped, GAMUT_C)).toBe(true);
    expect(distance(clamped, midpoint)).toBeLessThan(0.1);
  });
});

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A permissive point-in-triangle check, tolerant of the boundary itself. */
function isInsideOrOnTriangle(
  point: { x: number; y: number },
  triangle: { red: { x: number; y: number }; green: { x: number; y: number }; blue: { x: number; y: number } },
): boolean {
  const { red, green, blue } = triangle;
  const EPSILON = 1e-9;

  const sign = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

  const d1 = sign(red, green, point);
  const d2 = sign(green, blue, point);
  const d3 = sign(blue, red, point);

  const hasNegative = d1 < -EPSILON || d2 < -EPSILON || d3 < -EPSILON;
  const hasPositive = d1 > EPSILON || d2 > EPSILON || d3 > EPSILON;

  return !(hasNegative && hasPositive);
}
