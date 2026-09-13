/**
 * Floors at `min_dim_level` rather than 0, and the bottom of the slider is
 * still a `brightness` Command — never `on: false`. Turning a light off is
 * `OnOffToggle`'s job, deliberately a separate control sending a separate
 * Command, so the two can never be conflated in what this slider sends.
 *
 * Chakra's Slider fires `onValueChange` on every tick of a drag or every
 * arrow key, and `onValueChangeEnd` once on release — so the first drives
 * the live display and only the second sends a Command, and a drag costs
 * one PATCH rather than one per pixel moved. `onValueChangeEnd` fires
 * synchronously, before a controlled `value` has round-tripped through
 * React, so it reports the value it started from; the commit reads the
 * latest tick from a ref instead.
 *
 * Two layouts: stacked (label above, value below) on the detail page, and
 * `compact` on a card, where the label is for assistive technology only
 * and the value sits in a footer row beside whatever `caption` the card
 * supplies. The fill is muted while the Light is off, since the level it
 * holds is what it will come back on at, not what it is giving off.
 */
import { Flex, Slider, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function BrightnessSlider({
  brightness,
  minDimLevel,
  pendingBrightness,
  onCommit,
  on = true,
  compact = false,
  caption,
}: {
  brightness: number | undefined;
  minDimLevel: number | undefined;
  pendingBrightness: number | undefined;
  onCommit: (brightness: number) => void;
  on?: boolean;
  compact?: boolean;
  caption?: ReactNode;
}) {
  const floor = minDimLevel ?? 0;
  const confirmed = brightness ?? floor;
  const shown = pendingBrightness ?? confirmed;
  const [live, setLive] = useState(shown);
  const latest = useRef(shown);

  useEffect(() => {
    setLive(shown);
    latest.current = shown;
  }, [shown]);

  const pending = pendingBrightness !== undefined;

  return (
    <Slider.Root
      data-pending={pending ? "" : undefined}
      value={[live]}
      min={floor}
      max={100}
      step={0.5}
      onValueChange={({ value }) => {
        const next = value[0] ?? live;
        latest.current = next;
        setLive(next);
      }}
      onValueChangeEnd={() => onCommit(latest.current)}
      colorPalette="blue"
      size="sm"
      gap={compact ? "9px" : "2"}
      mt={compact ? "auto" : undefined}
    >
      <Slider.Label srOnly={compact} fontSize="13px" fontWeight="600" color="gray.600">
        Brightness
      </Slider.Label>
      <Slider.Control>
        <Slider.Track bg="gray.100" h="6px" rounded="full">
          <Slider.Range
            bg={on ? "linear-gradient(90deg, {colors.blue.500}, {colors.blue.300})" : "gray.300"}
          />
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
      <Flex align="baseline" justify="space-between" gap="2">
        {caption !== undefined && (
          <Text fontSize="12px" fontWeight="500" color="gray.500" truncate>
            {caption}
          </Text>
        )}
        <Text
          as="output"
          fontSize="13px"
          fontWeight="700"
          fontVariantNumeric="tabular-nums"
          color={pending ? "orange.500" : on ? "blue.600" : "gray.400"}
        >
          {on ? `${Math.round(live)}%` : "Off"}
        </Text>
      </Flex>
    </Slider.Root>
  );
}
