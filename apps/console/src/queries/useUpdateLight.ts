/**
 * Sending a Command, and what happens to the Pending Command it creates.
 *
 * `rejected` and a transport failure both mean nothing was applied, so both
 * clear the Pending Command immediately — there is nothing to wait on a read
 * to confirm. `success`, `partial` and `unknown` all leave it in place:
 * per ADR 0001 the Acknowledgement is not evidence of what the Light is now,
 * so only a fresher read settles it, and `PendingCommandsProvider` is what
 * notices one arriving.
 */
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { updateLight } from "../api/lights.js";
import type { Acknowledgement, LightCommand } from "../api/types.js";
import { usePendingCommands } from "../pending/PendingCommandsProvider.js";

export interface UpdateLightResult {
  send(lightId: string, command: LightCommand): void;
  lastAcknowledgement: Acknowledgement | undefined;
  lastError: unknown;
  isSending: boolean;
}

export function useUpdateLight(): UpdateLightResult {
  const { setPending, clearPending } = usePendingCommands();

  const mutation = useMutation({
    mutationFn: ({
      lightId,
      command,
    }: {
      lightId: string;
      command: LightCommand;
    }) => updateLight(lightId, command),
  });

  const send = useCallback(
    (lightId: string, command: LightCommand) => {
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
            }
          },
          onError() {
            clearPending(lightId, sentAt);
          },
        },
      );
    },
    [mutation, setPending, clearPending],
  );

  return {
    send,
    lastAcknowledgement: mutation.data,
    lastError: mutation.error,
    isSending: mutation.isPending,
  };
}
