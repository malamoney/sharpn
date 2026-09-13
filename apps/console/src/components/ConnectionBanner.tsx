/**
 * The `stale` and `disconnected` states from issue #7's list: data already
 * on screen may no longer be current, shown without replacing it.
 *
 * `disconnected` — this browser's own Server-Sent Events connection to the
 * Console API is down — is worth saying even though `loading`/`failed` are
 * handled per-query elsewhere: a person looking at a light list that stopped
 * updating needs to know it stopped, not just that it once loaded.
 */
import { Alert } from "@chakra-ui/react";

import { useLiveStatus } from "../events/LiveLightsProvider.js";

export function ConnectionBanner() {
  const status = useLiveStatus();

  if (status.kind === "connecting") {
    return null;
  }

  const message =
    status.kind === "disconnected"
      ? "Lost the live connection — trying to reconnect. What's on screen may be stale."
      : status.gateway === "reconnecting"
        ? "The Gateway connection is reconnecting. What's on screen may be stale."
        : status.resyncing
          ? "Catching up on changes…"
          : undefined;

  if (message === undefined) {
    return null;
  }

  return (
    <Alert.Root status="warning" variant="subtle" role="status" rounded="8px">
      <Alert.Indicator />
      <Alert.Description>{message}</Alert.Description>
    </Alert.Root>
  );
}
