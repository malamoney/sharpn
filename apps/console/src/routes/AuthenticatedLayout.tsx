/**
 * The shell around every route that needs a session: navigation, the
 * connection banner, and the one live event stream — opened here rather
 * than on the login page, which needs no Invalidations for a Light it is
 * not showing.
 */
import { useCallback } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { logout } from "../api/session.js";
import { ConnectionBanner } from "../components/ConnectionBanner.js";
import { LiveLightsProvider } from "../events/LiveLightsProvider.js";
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
          <Outlet />
        </main>
      </div>
    </LiveLightsProvider>
  );
}
