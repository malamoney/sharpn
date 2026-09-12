/**
 * `/`: every Light, sorted locale-aware by name — `ListLights` returns no
 * defined order, so the list must not reshuffle on refetch (`sortLights.ts`
 * is where that is guaranteed).
 */
import { LightRow } from "../components/LightRow.js";
import { LoadingView, OutageView } from "../components/OutageView.js";
import { sortLightsByName } from "../domain/sortLights.js";
import { useLightsQuery } from "../queries/lightsQueries.js";

export function LightListPage() {
  const query = useLightsQuery();

  if (query.isPending) {
    return <LoadingView />;
  }

  if (query.isError) {
    return <OutageView error={query.error} />;
  }

  if (query.data.length === 0) {
    return (
      <p className="empty-view" role="status">
        The Bridge reports no lights.
      </p>
    );
  }

  const sorted = sortLightsByName(query.data);

  return (
    <ul className="light-list">
      {sorted.map((light) => (
        <LightRow
          key={light.id}
          light={light}
          listDataUpdatedAt={query.dataUpdatedAt}
        />
      ))}
    </ul>
  );
}
