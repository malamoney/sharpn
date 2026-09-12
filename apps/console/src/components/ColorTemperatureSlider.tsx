/**
 * Labelled in Kelvin — nobody has an intuition for mirek — and bounded by
 * this Light's own `mirek_schema` where the Bridge reported one.
 *
 * React's `onChange` on `<input type="range">` fires on every tick of a
 * drag — it is wired to the native `input` event, not to `change` — so it
 * drives the live display but never sends a Command on its own. A Command
 * is sent once, on `pointerup` or `keyup`, so a drag costs one PATCH rather
 * than one per pixel moved.
 */
import { useEffect, useState } from "react";

import type { MirekRange } from "../api/types.js";
import {
  DEFAULT_MIREK_RANGE,
  kelvinBoundsFor,
  kelvinFromMirek,
  mirekFromKelvin,
} from "../domain/colorTemperature.js";

export function ColorTemperatureSlider({
  mirek,
  mirekSchema,
  pendingMirek,
  onCommit,
}: {
  mirek: number | undefined;
  mirekSchema: MirekRange | undefined;
  pendingMirek: number | undefined;
  onCommit: (mirek: number) => void;
}) {
  const range = mirekSchema ?? DEFAULT_MIREK_RANGE;
  const bounds = kelvinBoundsFor(mirekSchema);
  const confirmedKelvin = kelvinFromMirek(mirek ?? range.mirekMaximum);
  const shownKelvin = pendingMirek === undefined
    ? confirmedKelvin
    : kelvinFromMirek(pendingMirek);
  const [live, setLive] = useState(shownKelvin);

  useEffect(() => {
    setLive(shownKelvin);
  }, [shownKelvin]);

  function commit(kelvin: number): void {
    const clampedMirek = Math.min(
      range.mirekMaximum,
      Math.max(range.mirekMinimum, mirekFromKelvin(kelvin)),
    );
    onCommit(clampedMirek);
  }

  return (
    <div className={`control${pendingMirek !== undefined ? " pending" : ""}`}>
      <label htmlFor="color-temperature">Colour temperature</label>
      <input
        id="color-temperature"
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={live}
        onChange={(event) => setLive(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
      />
      <output htmlFor="color-temperature">{Math.round(live)} K</output>
    </div>
  );
}
