/**
 * Sending a Command, the slider policy issue #8 asks for, and what happens
 * to the Pending Command each outcome leaves behind.
 *
 * Slider policy: at most one PATCH in flight per Light. A second `send` for
 * a Light already in flight holds only its own value — replacing whatever
 * was held before it — rather than firing a second, concurrent PATCH. Once
 * the in-flight one settles, the held value is sent if it still differs
 * from what was just sent; the drag's own last commit is what a control
 * calls `send` with, so whatever is held when the in-flight one settles is
 * guaranteed to be sent, never silently dropped. No fixed throttle: gating
 * on in-flight self-paces to the Bridge's own round-trip time and gives
 * per-Light ordering for free, since there is never more than one Command
 * for a Light outstanding at once.
 *
 * `rejected` and an ordinary transport failure both mean nothing was
 * applied, so both clear the Pending Command immediately — there is nothing
 * to wait on a read to confirm. `success` leaves it in place: per ADR 0001
 * the Acknowledgement is not evidence of what the Light is now, so only a
 * fresher read settles it, and `PendingCommandsProvider` is what notices one
 * arriving. `partial` and `unknown` — and `MUTATION_OUTCOME_UNKNOWN`, the
 * same fact arriving as a failed request — leave the Pending Command
 * asserting something nobody knows, which is exactly the failure ADR 0001
 * exists to avoid: both clear it immediately and refetch the Light instead
 * of waiting for an Invalidation that may never come.
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { ApiError } from "../api/apiError.js";
import { updateLight } from "../api/lights.js";
import type { Acknowledgement, LightCommand } from "../api/types.js";
import { usePendingCommands } from "../pending/PendingCommandsProvider.js";
import { lightDetailKey } from "./queryKeys.js";
import { raceAwareInvalidate } from "./raceAwareInvalidate.js";

export interface UpdateLightResult {
  send(lightId: string, command: LightCommand): void;
  lastAcknowledgement: Acknowledgement | undefined;
  lastError: unknown;
  isSending: boolean;
}

function commandsEqual(a: LightCommand, b: LightCommand): boolean {
  return (
    a.on === b.on &&
    a.brightness === b.brightness &&
    a.colorTemperatureMirek === b.colorTemperatureMirek &&
    xyEqual(a.colorXy, b.colorXy)
  );
}

function xyEqual(
  a: LightCommand["colorXy"],
  b: LightCommand["colorXy"],
): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.x === b.x && a.y === b.y;
}

/** Refetches the Light itself — never the list, which nothing here changed. */
function refetchLight(queryClient: QueryClient, lightId: string): void {
  raceAwareInvalidate(queryClient, lightDetailKey(lightId));
}

export function useUpdateLight(): UpdateLightResult {
  const { setPending, clearPending } = usePendingCommands();
  const queryClient = useQueryClient();

  // In-flight and held state, per Light id. Local to this hook instance —
  // each Light's controls hold their own `useUpdateLight()` — but keyed
  // regardless, since nothing stops one instance being asked to send for
  // more than one Light.
  const inFlight = useRef(new Set<string>());
  const held = useRef(new Map<string, LightCommand>());

  const mutation = useMutation({
    mutationFn: ({
      lightId,
      command,
    }: {
      lightId: string;
      command: LightCommand;
    }) => updateLight(lightId, command),
  });

  const fireRef = useRef<(lightId: string, command: LightCommand) => void>(() => undefined);

  const settle = useCallback((lightId: string, justSent: LightCommand) => {
    inFlight.current.delete(lightId);
    const next = held.current.get(lightId);
    if (next === undefined) {
      return;
    }
    held.current.delete(lightId);
    if (!commandsEqual(next, justSent)) {
      fireRef.current(lightId, next);
    }
  }, []);

  const fire = useCallback(
    (lightId: string, command: LightCommand) => {
      inFlight.current.add(lightId);
      const sentAt = Date.now();
      setPending({ lightId, command, sentAt });
      mutation.mutate(
        { lightId, command },
        {
          // `sentAt` guards both callbacks: a second Command for this Light
          // may already be in flight by the time this one settles, and
          // clearing unconditionally would delete that newer one's Pending
          // Command out from under it rather than this one's own.
          onSuccess(acknowledgement) {
            if (acknowledgement.outcome === "rejected") {
              clearPending(lightId, sentAt);
            } else if (
              acknowledgement.outcome === "partial" ||
              acknowledgement.outcome === "unknown"
            ) {
              clearPending(lightId, sentAt);
              refetchLight(queryClient, lightId);
            }
            settle(lightId, command);
          },
          onError(error) {
            clearPending(lightId, sentAt);
            if (error instanceof ApiError && error.code === "MUTATION_OUTCOME_UNKNOWN") {
              refetchLight(queryClient, lightId);
            }
            settle(lightId, command);
          },
        },
      );
    },
    [mutation, setPending, clearPending, queryClient, settle],
  );
  fireRef.current = fire;

  const send = useCallback(
    (lightId: string, command: LightCommand) => {
      if (inFlight.current.has(lightId)) {
        held.current.set(lightId, command);
        return;
      }
      fire(lightId, command);
    },
    [fire],
  );

  return {
    send,
    lastAcknowledgement: mutation.data,
    lastError: mutation.error,
    isSending: mutation.isPending,
  };
}
