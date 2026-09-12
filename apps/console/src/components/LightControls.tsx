/**
 * Every control a Light's Capabilities allow, wired to one Pending Command
 * and one `useUpdateLight`. Each control sends its own single-field Command
 * on commit — never a batch of several fields at once — which is what keeps
 * `colorXy` and `colorTemperatureMirek` from ever being asked for in the
 * same request; ADR 0005 refuses that combination, but nothing here can even
 * construct it.
 */
import type { Light } from "../api/types.js";
import { messageForOutcome } from "../domain/acknowledgementMessage.js";
import { usePendingCommand } from "../pending/PendingCommandsProvider.js";
import { useUpdateLight } from "../queries/useUpdateLight.js";
import { ApiError } from "../api/apiError.js";
import { BrightnessSlider } from "./BrightnessSlider.js";
import { ColorControl } from "./ColorControl.js";
import { ColorTemperatureSlider } from "./ColorTemperatureSlider.js";
import { OnOffToggle } from "./OnOffToggle.js";

export function LightControls({
  light,
  dataUpdatedAt,
}: {
  light: Light;
  dataUpdatedAt: number;
}) {
  const pending = usePendingCommand(light.id, dataUpdatedAt);
  const { send, lastAcknowledgement, lastError } = useUpdateLight();

  const message =
    lastError instanceof ApiError
      ? lastError.message
      : lastAcknowledgement !== undefined
        ? messageForOutcome(lastAcknowledgement.outcome)
        : undefined;

  return (
    <div className="light-controls">
      <OnOffToggle
        on={light.on}
        pendingOn={pending?.command.on}
        onToggle={(on) => send(light.id, { on })}
      />

      {light.capabilities.dimming && (
        <BrightnessSlider
          brightness={light.brightness}
          minDimLevel={light.minDimLevel}
          pendingBrightness={pending?.command.brightness}
          onCommit={(brightness) => send(light.id, { brightness })}
        />
      )}

      {light.capabilities.colorTemperature && (
        <ColorTemperatureSlider
          mirek={light.colorTemperatureMirek}
          mirekSchema={light.mirekSchema}
          pendingMirek={pending?.command.colorTemperatureMirek}
          onCommit={(colorTemperatureMirek) =>
            send(light.id, { colorTemperatureMirek })
          }
        />
      )}

      {light.capabilities.color && (
        <ColorControl
          colorXy={light.colorXy}
          colorGamut={light.colorGamut}
          pendingXy={pending?.command.colorXy}
          onCommit={(colorXy) => send(light.id, { colorXy })}
        />
      )}

      {message !== undefined && (
        <p role="status" className="command-message">
          {message}
        </p>
      )}
    </div>
  );
}
