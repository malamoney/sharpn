/**
 * The navigation rail down the left of every signed-in page: the brand,
 * one entry per section, and a small card at the foot that says whether
 * live updates are flowing. Collapses to an icon rail; the choice sticks
 * across visits, in this browser only. Under the `md` breakpoint it lies
 * flat as a top bar and the collapse control disappears.
 *
 * Only Lights is listed. The design this follows sketches Rooms, Scenes,
 * Routines and Settings too, but the Console API serves none of them yet,
 * and a nav entry that goes nowhere is a promise the app cannot keep.
 */
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { NavLink, useMatch } from "react-router";

import { useLiveStatus, type LiveStatus } from "../events/LiveLightsProvider.js";
import { BrandMark } from "./BrandMark.js";
import { BulbIcon, ChevronLeftIcon } from "./icons.js";

const COLLAPSED_KEY = "sharpn.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // A browser that refuses storage still gets a working sidebar.
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  return [collapsed, () => setCollapsed((current) => !current)];
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const status = useLiveStatus();
  const onLights = useMatch({ path: "/", end: true }) !== null;
  const toggleLabel = collapsed ? "Expand navigation" : "Collapse navigation";

  return (
    <Flex
      as="nav"
      aria-label="Sections"
      flex="none"
      position={{ base: "static", md: "sticky" }}
      top="0"
      h={{ base: "auto", md: "100vh" }}
      w={{ base: "auto", md: collapsed ? "76px" : "248px" }}
      direction={{ base: "row", md: "column" }}
      align={{ base: "center", md: "stretch" }}
      gap={{ base: "3", md: "7" }}
      px={{ base: "4", md: "4" }}
      py={{ base: "3", md: "7" }}
      bg="white"
      borderColor="gray.100"
      borderRightWidth={{ base: "0", md: "1px" }}
      borderBottomWidth={{ base: "1px", md: "0" }}
      overflow="hidden"
      transition="width 0.22s ease"
    >
      <Flex align="center" gap="10px" px="1" h="32px">
        <BrandMark />
        <Text
          as="span"
          fontSize="17px"
          fontWeight="800"
          letterSpacing="-0.02em"
          whiteSpace="nowrap"
          display={{ base: "inline", md: collapsed ? "none" : "inline" }}
        >
          Sharpn
        </Text>
      </Flex>

      <IconButton
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-expanded={!collapsed}
        onClick={onToggle}
        size="xs"
        variant="outline"
        rounded="7px"
        color="gray.600"
        display={{ base: "none", md: "inline-flex" }}
        position="absolute"
        top={collapsed ? "auto" : "30px"}
        bottom={collapsed ? "96px" : "auto"}
        right={collapsed ? "25px" : "12px"}
      >
        <ChevronLeftIcon
          boxSize="14px"
          transition="transform 0.22s ease"
          transform={collapsed ? "rotate(180deg)" : "rotate(0deg)"}
        />
      </IconButton>

      <Flex
        as="ul"
        listStyleType="none"
        m="0"
        ml={{ base: "auto", md: "0" }}
        mt={{ base: "0", md: "1" }}
        p="0"
        direction={{ base: "row", md: "column" }}
        gap="1"
      >
        <li>
          <Button
            asChild
            variant={onLights ? "solid" : "ghost"}
            colorPalette={onLights ? "blue" : "gray"}
            color={onLights ? "white" : "gray.600"}
            fontWeight={onLights ? "600" : "500"}
            justifyContent="flex-start"
            w="full"
            h={{ base: "36px", md: "42px" }}
            px="3"
            rounded="10px"
            gap="3"
          >
            <NavLink to="/" title="Lights">
              <BulbIcon boxSize="18px" />
              <Text
                as="span"
                display={{ base: "inline", md: collapsed ? "none" : "inline" }}
              >
                Lights
              </Text>
            </NavLink>
          </Button>
        </li>
      </Flex>

      <Flex
        mt="auto"
        display={{ base: "none", md: "flex" }}
        align="center"
        justify={collapsed ? "center" : "flex-start"}
        gap="3"
        px={collapsed ? "0" : "4"}
        py="4"
        bg="blue.50"
        rounded="12px"
        whiteSpace="nowrap"
      >
        <Box
          flex="none"
          boxSize="10px"
          rounded="full"
          bg={liveDotColor(status)}
          boxShadow={`0 0 0 4px {colors.${liveDotColor(status)}/20}`}
          aria-hidden="true"
        />
        {!collapsed && (
          <Box>
            <Text
              fontSize="12px"
              fontWeight="700"
              letterSpacing="0.04em"
              textTransform="uppercase"
              color="blue.800"
            >
              Sharpn
            </Text>
            <Text mt="3px" fontSize="13px" color="blue.900">
              {liveLabel(status)}
            </Text>
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

function liveDotColor(status: LiveStatus): string {
  if (status.kind === "connecting") {
    return "gray.400";
  }
  if (status.kind === "disconnected" || status.gateway === "reconnecting") {
    return "orange.500";
  }
  return "green.500";
}

function liveLabel(status: LiveStatus): string {
  if (status.kind === "connecting") {
    return "Connecting…";
  }
  if (status.kind === "disconnected") {
    return "Live updates lost";
  }
  if (status.gateway === "reconnecting") {
    return "Gateway reconnecting";
  }
  if (status.resyncing) {
    return "Catching up…";
  }
  return "Live updates on";
}
