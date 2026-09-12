/**
 * The one place a `401` sends a browser back to `/login`.
 *
 * There is no "am I signed in" route to check up front (`http/session.ts`
 * has only sign-in and sign-out) — a session is only ever confirmed or
 * refused by the request that needed one. `api/client.ts` notices a `401` on
 * any of them and tells every listener; this is the listener that owns
 * navigation.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { onUnauthenticated } from "../api/client.js";

export function useAuthRedirect(): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(
    () =>
      onUnauthenticated(() => {
        navigate("/login", { replace: true, state: { from: location.pathname } });
      }),
    [navigate, location],
  );
}
