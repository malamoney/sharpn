/**
 * Labelled in Kelvin — nobody has an intuition for mirek — and bounded by
 * this Light's own `mirek_schema` where the Bridge reported one.
 *
 * `onValueChange` drives the live display on every tick; `onValueChangeEnd`
 * sends one Command on release, read from a ref for the reason
 * `BrightnessSlider` gives. The track shows the whole warm-to-cool run and
 * the filled range is transparent: a temperature is a position, not a
 * level.
 */
import { Flex, Slider, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

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
  const latest = useRef(shownKelvin);

  useEffect(() => {
    setLive(shownKelvin);
    latest.current = shownKelvin;
  }, [shownKelvin]);

  function commit(kelvin: number): void {
    const clampedMirek = Math.min(
      range.mirekMaximum,
      Math.max(range.mirekMinimum, mirekFromKelvin(kelvin)),
    );
    onCommit(clampedMirek);
  }

  const pending = pendingMirek !== undefined;

  return (
    <Slider.Root
      data-pending={pending ? "" : undefined}
      value={[live]}
      min={bounds.min}
      max={bounds.max}
      step={1}
      onValueChange={({ value }) => {
        const next = value[0] ?? live;
        latest.current = next;
        setLive(next);
      }}
      onValueChangeEnd={() => commit(latest.current)}
      size="sm"
      gap="2"
    >
      <Slider.Label fontSize="13px" fontWeight="600" color="gray.600">
        Colour temperature
      </Slider.Label>
      <Slider.Control>
        <Slider.Track
          h="6px"
          rounded="full"
          bg="linear-gradient(90deg, {colors.orange.300} 0%, {colors.yellow.100} 50%, {colors.blue.100} 100%)"
        >
          <Slider.Range bg="transparent" />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          boxSize="14px"
          bg="white"
          borderWidth="1px"
          borderColor={pending ? "orange.500" : "gray.200"}
          shadow="0 1px 3px rgba(16, 24, 40, 0.2)"
        />
      </Slider.Control>
      <Flex>
        <Text
          as="output"
          fontSize="13px"
          fontWeight="700"
          fontVariantNumeric="tabular-nums"
          color={pending ? "orange.500" : "blue.600"}
        >
          {Math.round(live)} K
        </Text>
      </Flex>
    </Slider.Root>
  );
}
