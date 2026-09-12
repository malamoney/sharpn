/**
 * One icon per bucket `archetypeIcon.ts` sorts a Light's archetype into —
 * six shapes plus a default, not the 49 real archetypes: issue #7 calls
 * drawing all of them a week of assets for a house with fifteen bulbs.
 */
import type { LightArchetype } from "../api/types.js";
import { iconBucketFor, type IconBucket } from "../domain/archetypeIcon.js";

const PATHS: Record<IconBucket, string> = {
  bulb: "M12 2a7 7 0 0 0-4 12.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26A7 7 0 0 0 12 2Zm-2 19h4",
  spot: "M4 14h16l-4-9H8l-4 9Zm4 0v3a4 4 0 0 0 8 0v-3",
  strip: "M3 8h18v2H3zM3 14h18v2H3z",
  lamp: "M12 3l6 8H6l6-8Zm-4 8h8l2 10H6l2-10Z",
  ceiling: "M2 6h20v2H2zM12 8v13",
  plug: "M9 2v6M15 2v6M7 8h10v5a5 5 0 0 1-10 0V8ZM12 17v5",
  default: "M12 2a7 7 0 0 0-4 12.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26A7 7 0 0 0 12 2Z",
};

export function ArchetypeIcon({ archetype }: { archetype: LightArchetype }) {
  const bucket = iconBucketFor(archetype);

  return (
    <svg
      className={`archetype-icon archetype-icon-${bucket}`}
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden="true"
    >
      <path d={PATHS[bucket]} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
