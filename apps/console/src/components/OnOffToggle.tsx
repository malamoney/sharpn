/** Every Light has `on`; there is no Capability flag to check before showing this. */
export function OnOffToggle({
  on,
  pendingOn,
  onToggle,
}: {
  on: boolean;
  pendingOn: boolean | undefined;
  onToggle: (on: boolean) => void;
}) {
  const shown = pendingOn ?? on;

  return (
    <label className={`control on-off${pendingOn !== undefined ? " pending" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={shown}
        aria-checked={shown}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
      <span>{shown ? "On" : "Off"}</span>
    </label>
  );
}
