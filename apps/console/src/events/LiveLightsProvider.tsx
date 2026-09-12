/**
 * Wires `eventStream.ts` to the query cache and exposes what it says about
 * the connection.
 *
 * On a `light.*` frame: refetch that one Light and the list (ADR 0002 — an
 * Invalidation names a Light and nothing else, so reading it again is the
 * only thing to do with one). On the stream itself reopening after having
 * been open before: refetch everything under `LIGHTS`, because that is the
 * one gap the Gateway's own Resync cannot reach — it resyncs *its*
 * subscription to the Gateway, not this browser's connection to the Console
 * API (ADR 0002's last paragraph).
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { openEventStream, type ConnectionStatus } from "./eventStream.js";
import { LIGHTS, lightDetailKey, lightsListKey } from "../queries/queryKeys.js";

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

  useEffect(() => {
    const handle = openEventStream("/api/v1/events", {
      onLightNotice({ id }) {
        queryClient.invalidateQueries({ queryKey: lightsListKey, exact: true });
        queryClient.invalidateQueries({ queryKey: lightDetailKey(id), exact: true });
      },
      onConnectionStatus(connection) {
        setStatus({ kind: "connected", ...connection });
      },
      onStreamOpen(isReconnect) {
        if (isReconnect) {
          queryClient.invalidateQueries({ queryKey: LIGHTS });
        }
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
