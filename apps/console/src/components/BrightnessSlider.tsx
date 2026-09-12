/**
 * Floors at `min_dim_level` rather than 0, and the bottom of the slider is
 * still a `brightness` Command — never `on: false`. Turning a light off is
 * `OnOffToggle`'s job, deliberately a separate control sending a separate
 * Command, so the two can never be conflated in what this slider sends.
 *
 * React's `onChange` on `<input type="range">` fires on every tick of a
 * drag — it is wired to the native `input` event, not to `change` — so it
 * drives the live display but never sends a Command on its own. A Command
 * is sent once, on `pointerup` or `keyup`, so a drag costs one PATCH rather
 * than one per pixel moved.
 */
import { useEffect, useState } from "react";

export function BrightnessSlider({
  brightness,
  minDimLevel,
  pendingBrightness,
  onCommit,
}: {
  brightness: number | undefined;
  minDimLevel: number | undefined;
  pendingBrightness: number | undefined;
  onCommit: (brightness: number) => void;
}) {
  const floor = minDimLevel ?? 0;
  const confirmed = brightness ?? floor;
  const shown = pendingBrightness ?? confirmed;
  const [live, setLive] = useState(shown);

  useEffect(() => {
    setLive(shown);
  }, [shown]);

  return (
    <div className={`control${pendingBrightness !== undefined ? " pending" : ""}`}>
      <label htmlFor="brightness">Brightness</label>
      <input
        id="brightness"
        type="range"
        min={floor}
        max={100}
        step={0.5}
        value={live}
        onChange={(event) => setLive(Number(event.currentTarget.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
      />
      <output htmlFor="brightness">{Math.round(live)}%</output>
    </div>
  );
}
