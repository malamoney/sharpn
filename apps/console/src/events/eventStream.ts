/**
 * The browser side of `http/events.ts`: one `EventSource`, decoded into the
 * three things a Console cares about — an Invalidation, a `connection`
 * status pulse, and the stream's own up/down.
 *
 * `EventSourceImpl` is a parameter rather than a bare reference to the
 * global so a test can hand this a stand-in: jsdom does not implement
 * `EventSource`, and the real one reconnects on its own timers, which a test
 * has no business waiting on.
 */

/** `light.changed`, `light.added` or `light.removed` — an id and nothing else (ADR 0002). */
export interface LightNotice {
  id: string;
  change: "added" | "changed" | "removed";
}

/** What the `connection` event says about the Gateway side of the Console API. */
export interface ConnectionStatus {
  gateway: "connected" | "reconnecting";
  resyncing: boolean;
}

export interface EventStreamHandlers {
  onLightNotice(notice: LightNotice): void;
  onConnectionStatus(status: ConnectionStatus): void;
  /**
   * The stream opened. `isReconnect` is false the first time and true every
   * time after: the browser's own subscription having dropped and come back
   * is exactly when ADR 0002 says to refetch the full collection, since the
   * Gateway cannot resync a gap in *this* connection.
   */
  onStreamOpen(isReconnect: boolean): void;
  /** The stream is down: retrying on `EventSource`'s own schedule, or gone for good. */
  onStreamDown(): void;
}

export interface EventStreamHandle {
  close(): void;
}

const LIGHT_CHANGES = ["added", "changed", "removed"] as const;

export function openEventStream(
  url: string,
  handlers: EventStreamHandlers,
  EventSourceImpl: typeof EventSource = EventSource,
): EventStreamHandle {
  const source = new EventSourceImpl(url, { withCredentials: true });
  let everOpened = false;

  source.addEventListener("open", () => {
    handlers.onStreamOpen(everOpened);
    everOpened = true;
  });

  source.addEventListener("error", () => {
    handlers.onStreamDown();
  });

  for (const change of LIGHT_CHANGES) {
    source.addEventListener(`light.${change}`, (event) => {
      const { id } = JSON.parse((event as MessageEvent<string>).data) as {
        id: string;
      };
      handlers.onLightNotice({ id, change });
    });
  }

  source.addEventListener("connection", (event) => {
    const status = JSON.parse(
      (event as MessageEvent<string>).data,
    ) as ConnectionStatus;
    handlers.onConnectionStatus(status);
  });

  return {
    close() {
      source.close();
    },
  };
}
