/**
 * The `stale` and `disconnected` states from issue #7's list: data already
 * on screen may no longer be current, shown without replacing it.
 *
 * `disconnected` — this browser's own Server-Sent Events connection to the
 * Console API is down — is worth saying even though `loading`/`failed` are
 * handled per-query elsewhere: a person looking at a light list that stopped
 * updating needs to know it stopped, not just that it once loaded.
 */
import { useLiveStatus } from "../events/LiveLightsProvider.js";

export function ConnectionBanner() {
  const status = useLiveStatus();

  if (status.kind === "connecting") {
    return null;
  }

  if (status.kind === "disconnected") {
    return (
      <p className="connection-banner" role="status">
        Lost the live connection — trying to reconnect. What's on screen may
        be stale.
      </p>
    );
  }

  if (status.gateway === "reconnecting") {
    return (
      <p className="connection-banner" role="status">
        The Gateway connection is reconnecting. What's on screen may be
        stale.
      </p>
    );
  }

  if (status.resyncing) {
    return (
      <p className="connection-banner" role="status">
        Catching up on changes…
      </p>
    );
  }

  return null;
}
