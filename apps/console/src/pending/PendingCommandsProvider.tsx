/**
 * Where Pending Commands live: outside the query cache, per `CONTEXT.md` and
 * ADR 0001, because TanStack Query's optimistic-update helpers assume the
 * mutation response confirms the new value, and an Acknowledgement
 * structurally cannot.
 *
 * One per Light at a time — a second Command for the same Light replaces the
 * first, since only the most recent thing a person asked for is what a
 * control should be showing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isSupersededByAReadAfter, type PendingCommand } from "./pendingCommand.js";

interface PendingCommandsValue {
  pending: Readonly<Record<string, PendingCommand>>;
  setPending(command: PendingCommand): void;
  /**
   * Clears the Pending Command for `lightId` — but only if it is still the
   * one sent at `ifSentAt`. Two Commands for the same Light can be in flight
   * at once (a second drag started before the first's Acknowledgement
   * arrived), and without this guard the first one settling — rejected, or
   * erroring outright — would delete the second, still-outstanding one out
   * from under it. Omit `ifSentAt` to clear unconditionally.
   */
  clearPending(lightId: string, ifSentAt?: number): void;
}

const PendingCommandsContext = createContext<PendingCommandsValue | undefined>(
  undefined,
);

export function PendingCommandsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pending, setPendingState] = useState<Record<string, PendingCommand>>(
    {},
  );

  const setPending = useCallback((command: PendingCommand) => {
    setPendingState((current) => ({ ...current, [command.lightId]: command }));
  }, []);

  const clearPending = useCallback((lightId: string, ifSentAt?: number) => {
    setPendingState((current) => {
      const existing = current[lightId];
      if (existing === undefined) {
        return current;
      }
      if (ifSentAt !== undefined && existing.sentAt !== ifSentAt) {
        // A newer Command has already replaced this one; whoever is
        // clearing is settling stale, and has nothing left to clear.
        return current;
      }
      const next = { ...current };
      delete next[lightId];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ pending, setPending, clearPending }),
    [pending, setPending, clearPending],
  );

  return (
    <PendingCommandsContext.Provider value={value}>
      {children}
    </PendingCommandsContext.Provider>
  );
}

export function usePendingCommands(): PendingCommandsValue {
  const value = useContext(PendingCommandsContext);
  if (value === undefined) {
    throw new Error(
      "usePendingCommands was called outside a PendingCommandsProvider",
    );
  }
  return value;
}

/**
 * The Pending Command for one Light, if there is one — cleared automatically
 * once `dataUpdatedAt` (a query's own freshness timestamp) names a read that
 * came after the Command was sent. That read is the truth from here on,
 * whatever it says (ADR 0001), so there is nothing left for the Pending
 * Command to show.
 */
export function usePendingCommand(
  lightId: string,
  dataUpdatedAt: number | undefined,
): PendingCommand | undefined {
  const { pending, clearPending } = usePendingCommands();
  const current = pending[lightId];

  useEffect(() => {
    if (
      current !== undefined &&
      dataUpdatedAt !== undefined &&
      isSupersededByAReadAfter(current, dataUpdatedAt)
    ) {
      clearPending(lightId);
    }
  }, [current, dataUpdatedAt, lightId, clearPending]);

  return current;
}
