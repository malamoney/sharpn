/**
 * The colour control: the gamut triangle when a Light reports one, an HSV
 * wheel assuming Gamut C when it does not — the proto notes some bulbs do
 * not properly return their gamut. Preset swatches sit beside either, each
 * clamped onto whichever triangle is in play before it is sent.
 */
import type { ColorGamut, ColorXy } from "../api/types.js";
import { COLOR_PRESETS } from "../domain/colorPresets.js";
import { clampToGamut, GAMUT_C } from "../domain/gamutTriangle.js";
import { GamutTrianglePicker } from "./GamutTrianglePicker.js";
import { HsvWheelPicker } from "./HsvWheelPicker.js";

export function ColorControl({
  colorXy,
  colorGamut,
  pendingXy,
  onCommit,
}: {
  colorXy: ColorXy | undefined;
  colorGamut: ColorGamut | undefined;
  pendingXy: ColorXy | undefined;
  onCommit: (xy: ColorXy) => void;
}) {
  const gamut = colorGamut ?? GAMUT_C;
  const shown = pendingXy ?? colorXy ?? centroidOf(gamut);

  return (
    <div className={`control${pendingXy !== undefined ? " pending" : ""}`}>
      <span className="control-label">Colour</span>
      {colorGamut === undefined ? (
        <HsvWheelPicker onCommit={onCommit} />
      ) : (
        <GamutTrianglePicker gamut={colorGamut} value={shown} onCommit={onCommit} />
      )}
      <div className="color-presets" role="group" aria-label="Preset colours">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="color-preset"
            title={preset.name}
            aria-label={preset.name}
            style={{ backgroundColor: preset.swatch }}
            onClick={() => onCommit(clampToGamut(preset.xy, gamut))}
          />
        ))}
      </div>
    </div>
  );
}

function centroidOf(gamut: ColorGamut): ColorXy {
  return {
    x: (gamut.red.x + gamut.green.x + gamut.blue.x) / 3,
    y: (gamut.red.y + gamut.green.y + gamut.blue.y) / 3,
  };
}
