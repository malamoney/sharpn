/**
 * The colour control: the gamut triangle when a Light reports one, an HSV
 * wheel assuming Gamut C when it does not — the proto notes some bulbs do
 * not properly return their gamut. Preset swatches sit beside either, each
 * clamped onto whichever triangle is in play before it is sent.
 *
 * The two pickers stay hand-drawn (`GamutTrianglePicker`, `HsvWheelPicker`):
 * Chakra's own ColorPicker works in sRGB, and a Light's colour is a point in
 * its gamut triangle in CIE xy, which is a different thing to pick.
 */
import { chakra, Flex, Stack, Text } from "@chakra-ui/react";

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
  const pending = pendingXy !== undefined;

  return (
    <Stack gap="2" data-pending={pending ? "" : undefined}>
      <Text
        as="span"
        fontSize="13px"
        fontWeight="600"
        color={pending ? "orange.500" : "gray.600"}
      >
        Colour
      </Text>
      {colorGamut === undefined ? (
        <HsvWheelPicker onCommit={onCommit} />
      ) : (
        <GamutTrianglePicker gamut={colorGamut} value={shown} onCommit={onCommit} />
      )}
      <Flex wrap="wrap" gap="2" mt="2" role="group" aria-label="Preset colours">
        {COLOR_PRESETS.map((preset) => (
          <chakra.button
            type="button"
            key={preset.name}
            title={preset.name}
            aria-label={preset.name}
            boxSize="28px"
            rounded="full"
            borderWidth="1px"
            borderColor="gray.200"
            p="0"
            cursor="pointer"
            bg={preset.swatch}
            onClick={() => onCommit(clampToGamut(preset.xy, gamut))}
          />
        ))}
      </Flex>
    </Stack>
  );
}

function centroidOf(gamut: ColorGamut): ColorXy {
  return {
    x: (gamut.red.x + gamut.green.x + gamut.blue.x) / 3,
    y: (gamut.red.y + gamut.green.y + gamut.blue.y) / 3,
  };
}
