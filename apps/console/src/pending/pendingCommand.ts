/**
 * A Pending Command's lifecycle rule.
 *
 * CONTEXT.md: "A Pending Command is what the person asked for and is never
 * rendered as what is true." ADR 0001 is why it cannot be resolved from the
 * Acknowledgement that follows a Command — that answers with an outcome, not
 * a Light — so it is resolved by the next read instead: once a read arrives
 * that is newer than the Command, that read is the truth and the Pending
 * Command has nothing left to say. This file is that comparison, tracked
 * outside the query cache per issue #7, because TanStack Query's own
 * optimistic-update helpers assume a mutation response confirms the new
 * value, which here it structurally cannot.
 */
import type { LightCommand } from "../api/types.js";

export interface PendingCommand {
  lightId: string;
  command: LightCommand;
  /** `Date.now()` when the Command was sent. */
  sentAt: number;
}

/**
 * Whether a read timestamped `dataUpdatedAt` is evidence about what a
 * Pending Command asked for — which is to say, whether it arrived after the
 * Command was sent.
 *
 * Strictly after: a read from the same instant, or from before, cannot have
 * observed a Command it did not yet know about, and is not what settles it.
 */
export function isSupersededByAReadAfter(
  pending: PendingCommand,
  dataUpdatedAt: number,
): boolean {
  return dataUpdatedAt > pending.sentAt;
}
