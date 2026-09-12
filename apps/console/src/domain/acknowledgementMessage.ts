/**
 * What an Outcome is shown as, in words that hold up under ADR 0001.
 *
 * `success` returns `undefined` on purpose: an Acknowledgement is evidence a
 * Command was accepted, never evidence of what a Light now is, so there is
 * nothing honest to say about the Light itself yet — the Pending Command
 * stays showing what was asked for until a fresh read confirms or corrects
 * it. `unknown` is deliberately never described as a failure: the reply was
 * lost, not the Command.
 */
import type { Outcome } from "../api/types.js";

export function messageForOutcome(outcome: Outcome): string | undefined {
  switch (outcome) {
    case "success":
      return undefined;
    case "partial":
      return "Only some of that change went through.";
    case "rejected":
      return "The Bridge would not make that change.";
    case "unknown":
      return "That took too long to answer for, so nobody knows yet whether it was made.";
  }
}
