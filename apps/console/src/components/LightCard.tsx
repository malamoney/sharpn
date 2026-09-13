/**
 * One Light in the grid: its icon and switch across the top, its name (a
 * link to the detail page) and fitting beneath, and — where the Light can
 * be dimmed — a brightness slider that sends the same single-field Command
 * the detail page's does. A Light with no dimming gets the footer row alone,
 * so every card ends the same way.
 */
import { Box, Card, Center, Flex, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router";

import type { Light } from "../api/types.js";
import { archetypeLabel } from "../domain/archetypeLabel.js";
import { usePendingCommand } from "../pending/PendingCommandsProvider.js";
import { useUpdateLight } from "../queries/useUpdateLight.js";
import { ArchetypeIcon } from "./ArchetypeIcon.js";
import { BrightnessSlider } from "./BrightnessSlider.js";
import { OnOffToggle } from "./OnOffToggle.js";

export function LightCard({
  light,
  listDataUpdatedAt,
}: {
  light: Light;
  listDataUpdatedAt: number;
}) {
  const pending = usePendingCommand(light.id, listDataUpdatedAt);
  const { send } = useUpdateLight();
  const on = pending?.command.on ?? light.on;
  const caption = capabilitiesCaption(light);

  return (
    <Card.Root as="li" rounded="16px" border="none" shadow="card" bg="white">
      <Card.Body p={{ base: "18px", md: "5" }} gap="14px">
        <Flex align="flex-start" justify="space-between">
          <LightIconTile archetype={light.archetype} on={on} />
          <OnOffToggle
            on={light.on}
            pendingOn={pending?.command.on}
            onToggle={(next) => send(light.id, { on: next })}
            labelHidden
          />
        </Flex>

        <Box minW="0">
          <Link
            asChild
            display="block"
            fontSize="17px"
            fontWeight="700"
            letterSpacing="-0.01em"
            lineHeight="1.25"
            color={on ? "gray.800" : "gray.500"}
            truncate
            _hover={{ color: "blue.600", textDecoration: "none" }}
          >
            <RouterLink to={`/lights/${encodeURIComponent(light.id)}`}>{light.name}</RouterLink>
          </Link>
          <Text mt="3px" fontSize="12px" fontWeight="500" color="gray.400">
            {archetypeLabel(light.archetype)}
          </Text>
        </Box>

        {light.capabilities.dimming ? (
          <BrightnessSlider
            brightness={light.brightness}
            minDimLevel={light.minDimLevel}
            pendingBrightness={pending?.command.brightness}
            onCommit={(brightness) => send(light.id, { brightness })}
            on={on}
            compact
            caption={caption}
          />
        ) : (
          <Flex mt="auto" align="baseline" justify="space-between" gap="2">
            <Text fontSize="12px" fontWeight="500" color="gray.500" truncate>
              {caption}
            </Text>
            <Text fontSize="13px" fontWeight="700" color={on ? "blue.600" : "gray.400"}>
              {on ? "On" : "Off"}
            </Text>
          </Flex>
        )}
      </Card.Body>
    </Card.Root>
  );
}

/** The 44px tile behind a Light's icon: blue while on, ghosted while off. */
export function LightIconTile({
  archetype,
  on,
}: {
  archetype: Light["archetype"];
  on: boolean;
}) {
  return (
    <Center
      boxSize="44px"
      rounded="12px"
      bg={on ? "blue.50" : "gray.50"}
      color={on ? "blue.500" : "gray.400"}
    >
      <ArchetypeIcon archetype={archetype} />
    </Center>
  );
}

/** "Dim · Whites · Colour" — what the detail page will offer. */
function capabilitiesCaption(light: Light): string {
  const parts: string[] = [];
  if (light.capabilities.dimming) {
    parts.push("Dim");
  }
  if (light.capabilities.colorTemperature) {
    parts.push("Whites");
  }
  if (light.capabilities.color) {
    parts.push("Colour");
  }
  return parts.length === 0 ? "On / off" : parts.join(" · ");
}
