import { Link } from "react-router";

import type { Light } from "../api/types.js";
import { usePendingCommand } from "../pending/PendingCommandsProvider.js";
import { useUpdateLight } from "../queries/useUpdateLight.js";
import { ArchetypeIcon } from "./ArchetypeIcon.js";
import { OnOffToggle } from "./OnOffToggle.js";

export function LightRow({
  light,
  listDataUpdatedAt,
}: {
  light: Light;
  listDataUpdatedAt: number;
}) {
  const pending = usePendingCommand(light.id, listDataUpdatedAt);
  const { send } = useUpdateLight();

  return (
    <li className="light-row">
      <Link to={`/lights/${encodeURIComponent(light.id)}`} className="light-row-link">
        <ArchetypeIcon archetype={light.archetype} />
        <span className="light-row-name">{light.name}</span>
      </Link>
      <OnOffToggle
        on={light.on}
        pendingOn={pending?.command.on}
        onToggle={(on) => send(light.id, { on })}
      />
    </li>
  );
}
