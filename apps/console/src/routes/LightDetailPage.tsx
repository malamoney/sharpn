/**
 * `/lights/:id`: one Light, deep-linkable, with every control its
 * Capabilities allow.
 */
import { useParams } from "react-router";

import { ArchetypeIcon } from "../components/ArchetypeIcon.js";
import { LightControls } from "../components/LightControls.js";
import { LoadingView, OutageView } from "../components/OutageView.js";
import { useLightQuery } from "../queries/lightsQueries.js";

export function LightDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useLightQuery(id ?? "");

  if (id === undefined) {
    return <OutageView error={new Error("no light id in the URL")} />;
  }

  if (query.isPending) {
    return <LoadingView />;
  }

  if (query.isError) {
    return <OutageView error={query.error} />;
  }

  const light = query.data;

  return (
    <article className="light-detail">
      <header>
        <ArchetypeIcon archetype={light.archetype} />
        <h1>{light.name}</h1>
      </header>
      {/* The known limitation issue #7 asks to surface honestly, rather than
          a name field that quietly does nothing when edited: `LightPut`
          carries no `metadata`, so a Light cannot be renamed here. */}
      <p className="rename-notice">
        Names come from the Bridge and can't be changed here.
      </p>
      <LightControls light={light} dataUpdatedAt={query.dataUpdatedAt} />
    </article>
  );
}
