/**
 * The shell around every route that needs a session: the sidebar, the
 * connection banner, and the one live event stream — opened here rather
 * than on the login page, which needs no Invalidations for a Light it is
 * not showing.
 *
 * A route's own queries mount only once the stream has connected or has
 * failed outright — never while still `connecting` — so the SSE
 * subscription is established before the initial `ListLights` read, rather
 * than racing it (issue #8).
 */
import { Flex } from "@chakra-ui/react";
import { Outlet } from "react-router";

import { ConnectionBanner } from "../components/ConnectionBanner.js";
import { LoadingView } from "../components/OutageView.js";
import { Sidebar, useSidebarCollapsed } from "../components/Sidebar.js";
import { LiveLightsProvider, useLiveStatus } from "../events/LiveLightsProvider.js";
import { useAuthRedirect } from "./useAuthRedirect.js";

export function AuthenticatedLayout() {
  useAuthRedirect();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <LiveLightsProvider>
      <Flex minH="100vh" direction={{ base: "column", md: "row" }}>
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        <Flex
          as="main"
          flex="1"
          minW="0"
          direction="column"
          gap={{ base: "18px", md: "26px" }}
          px={{ base: "5", md: "8" }}
          pt={{ base: "22px", md: "28px" }}
          pb={{ base: "8", md: "10" }}
        >
          <ConnectionBanner />
          <AuthenticatedRoutes />
        </Flex>
      </Flex>
    </LiveLightsProvider>
  );
}

function AuthenticatedRoutes() {
  const status = useLiveStatus();

  if (status.kind === "connecting") {
    return <LoadingView />;
  }

  return <Outlet />;
}
