/**
 * The shell around every route that needs a session: navigation, the
 * connection banner, and the one live event stream — opened here rather
 * than on the login page, which needs no Invalidations for a Light it is
 * not showing.
 *
 * A route's own queries mount only once the stream has connected or has
 * failed outright — never while still `connecting` — so the SSE
 * subscription is established before the initial `ListLights` read, rather
 * than racing it (issue #8).
 */
import { useCallback } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { logout } from "../api/session.js";
import { ConnectionBanner } from "../components/ConnectionBanner.js";
import { LoadingView } from "../components/OutageView.js";
import { LiveLightsProvider, useLiveStatus } from "../events/LiveLightsProvider.js";
import { useAuthRedirect } from "./useAuthRedirect.js";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  useAuthRedirect();

  const handleSignOut = useCallback(() => {
    void logout().finally(() => {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    });
  }, [navigate, location]);

  return (
    <LiveLightsProvider>
      <div className="app-shell">
        <header className="app-header">
          <Link to="/" className="app-title">
            sharpn
          </Link>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </header>
        <ConnectionBanner />
        <main>
          <AuthenticatedRoutes />
        </main>
      </div>
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
