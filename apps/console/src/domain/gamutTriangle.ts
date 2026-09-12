/**
 * The triangle a colour bulb can actually produce, and moving a point into it.
 *
 * Issue #7 asks for a picker that operates directly in xy so that every
 * reachable point is a colour the bulb can actually produce, with no
 * clamping step where the light comes back a different colour than the one
 * touched. That only holds if dragging *inside* the triangle is a no-op and
 * a drag that leaves it is caught here, at the one seam a Command is built
 * from — not left to the Bridge, which has no way to say "I moved that".
 */
import type { ColorGamut, ColorXy } from "../api/types.js";

/**
 * Gamut C, Philips' own coordinates. The fallback for a bulb that reports no
 * gamut of its own — the proto notes some do not — and the triangle an HSV
 * wheel is drawn against for the same reason.
 */
export const GAMUT_C: ColorGamut = {
  red: { x: 0.6915, y: 0.3083 },
  green: { x: 0.17, y: 0.7 },
  blue: { x: 0.1532, y: 0.0475 },
};

/**
 * `point`, moved onto the triangle if it is not already inside it.
 *
 * A point inside — including exactly on an edge or a corner — is returned
 * unchanged. One outside is replaced by the closest point on whichever edge
 * it crossed, found by projecting it onto all three edges (clamped to each
 * segment) and keeping the nearest: the point closest to what was asked for
 * that the bulb can actually produce.
 */
export function clampToGamut(point: ColorXy, gamut: ColorGamut): ColorXy {
  const { red, green, blue } = gamut;

  if (isInsideTriangle(point, red, green, blue)) {
    return point;
  }

  const candidates = [
    closestOnSegment(point, red, green),
    closestOnSegment(point, green, blue),
    closestOnSegment(point, blue, red),
  ];

  return candidates.reduce((nearest, candidate) =>
    squaredDistance(candidate, point) < squaredDistance(nearest, point)
      ? candidate
      : nearest,
  );
}

function squaredDistance(a: ColorXy, b: ColorXy): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** The point on segment `a`–`b` nearest to `point`, clamped to the segment. */
function closestOnSegment(point: ColorXy, a: ColorXy, b: ColorXy): ColorXy {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;

  if (lengthSquared === 0) {
    return a;
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared),
  );

  return { x: a.x + t * abx, y: a.y + t * aby };
}

/** Barycentric sign test, tolerant of the boundary itself. */
function isInsideTriangle(
  point: ColorXy,
  a: ColorXy,
  b: ColorXy,
  c: ColorXy,
): boolean {
  const EPSILON = 1e-9;
  const sign = (p1: ColorXy, p2: ColorXy, p3: ColorXy): number =>
    (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);

  const d1 = sign(a, b, point);
  const d2 = sign(b, c, point);
  const d3 = sign(c, a, point);

  const hasNegative = d1 < -EPSILON || d2 < -EPSILON || d3 < -EPSILON;
  const hasPositive = d1 > EPSILON || d2 > EPSILON || d3 > EPSILON;

  return !(hasNegative && hasPositive);
}
