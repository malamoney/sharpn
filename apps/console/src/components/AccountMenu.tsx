/**
 * The avatar at the top right and the menu it opens. There is one password
 * and no identity behind it (`api/session.ts`), so the label is "Account"
 * rather than a name the Console could only invent.
 */
import { Button, Center, Menu, Portal, Text } from "@chakra-ui/react";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import { logout } from "../api/session.js";
import { ChevronDownIcon, LogOutIcon, PersonIcon } from "./icons.js";

export function AccountMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogOut = useCallback(() => {
    void logout().finally(() => {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    });
  }, [navigate, location]);

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <Button variant="ghost" colorPalette="gray" h="40px" px="10px" gap="9px" rounded="8px">
          <Center boxSize="32px" rounded="full" bg="gray.200" color="gray.600" aria-hidden="true">
            <PersonIcon boxSize="18px" />
          </Center>
          <Text as="span" fontSize="13.5px" fontWeight="600" color="gray.700">
            Account
          </Text>
          <ChevronDownIcon boxSize="14px" color="gray.500" />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="170px" rounded="8px" shadow="lg">
            <Menu.Item value="log-out" onSelect={handleLogOut} gap="10px" fontWeight="500">
              <LogOutIcon boxSize="16px" />
              Log out
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
