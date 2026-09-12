/**
 * Wires `eventStream.ts` to the query cache and exposes what it says about
 * the connection.
 *
 * `light.changed` invalidates that one Light's detail query and nothing
 * more — an Invalidation carries an id only (ADR 0002), so a `light.changed`
 * has nothing to say about the list. `light.added` and `light.removed`
 * change which Lights exist, so they invalidate the list instead.
 *
 * `raceAwareInvalidate` rather than `queryClient.invalidateQueries` directly:
 * a query already mid-fetch when an Invalidation arrives may have been
 * requested before whatever just changed, so its response cannot be assumed
 * to reflect it (issue #8).
 *
 * The full collection is refetched on exactly one transition: the Console
 * API's own subscription to the Gateway recovering (`connection.gateway`
 * going from `reconnecting` back to `connected`) — the one gap nothing else
 * here resyncs, per ADR 0002's last paragraph. Not on a `resyncing` pulse
 * (`CAUSE_RECONNECTED`, which the Gateway's own Resync already covers with
 * ordinary Invalidations), and not merely because this browser's own stream
 * reopened — that reopening is what delivers a fresh `connection` status in
 * the first place, and it is *that* status, not the reopening itself, that
 * says whether anything was missed.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { openEventStream, type ConnectionStatus } from "./eventStream.js";
import { LIGHTS, lightDetailKey, lightsListKey } from "../queries/queryKeys.js";
import { raceAwareInvalidate } from "../queries/raceAwareInvalidate.js";

export type LiveStatus =
  | { kind: "connecting" }
  | ({ kind: "connected" } & ConnectionStatus)
  | { kind: "disconnected" };

const LiveStatusContext = createContext<LiveStatus>({ kind: "connecting" });

export function useLiveStatus(): LiveStatus {
  return useContext(LiveStatusContext);
}

export function LiveLightsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>({ kind: "connecting" });
  const previousGateway = useRef<ConnectionStatus["gateway"] | undefined>(undefined);

  useEffect(() => {
    const handle = openEventStream("/api/v1/events", {
      onLightNotice({ id, change }) {
        if (change === "changed") {
          raceAwareInvalidate(queryClient, lightDetailKey(id));
          return;
        }

        raceAwareInvalidate(queryClient, lightsListKey);
      },
      onConnectionStatus(connection) {
        setStatus({ kind: "connected", ...connection });

        if (previousGateway.current === "reconnecting" && connection.gateway === "connected") {
          void queryClient.invalidateQueries({ queryKey: LIGHTS });
        }
        previousGateway.current = connection.gateway;
      },
      onStreamOpen() {
        // The reopening itself triggers nothing: the `connection` status
        // that follows is what says whether the Console API's own
        // subscription needs a full resync, not the fact of reopening.
      },
      onStreamDown() {
        setStatus({ kind: "disconnected" });
      },
    });

    return () => handle.close();
  }, [queryClient]);

  return (
    <LiveStatusContext.Provider value={status}>
      {children}
    </LiveStatusContext.Provider>
  );
}
