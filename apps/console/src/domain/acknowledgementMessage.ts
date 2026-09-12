/**
 * What an Outcome — or an update that never got an Acknowledgement at all —
 * is shown as, in words that hold up under ADR 0001.
 *
 * `success` returns `undefined` on purpose: an Acknowledgement is evidence a
 * Command was accepted, never evidence of what a Light now is, so there is
 * nothing honest to say about the Light itself yet — the Pending Command
 * stays showing what was asked for until a fresh read confirms or corrects
 * it. `unknown` — and `MUTATION_OUTCOME_UNKNOWN`, which is the same fact
 * arriving as a failed request rather than a successful one with an
 * ambiguous body — is deliberately never described as a failure: the reply
 * was lost, not the Command. `partial` shows `errors[].description`
 * verbatim rather than a generic line: that string is the entire diagnostic
 * the Bridge gave, and paraphrasing it away would destroy the only
 * information there is.
 */
import type { ApiError } from "../api/apiError.js";
import type { Acknowledgement } from "../api/types.js";

export const COULD_NOT_CONFIRM_MESSAGE = "couldn't confirm — refreshed";

export function messageForOutcome(acknowledgement: Acknowledgement): string | undefined {
  switch (acknowledgement.outcome) {
    case "success":
      return undefined;
    case "partial":
      return acknowledgement.errors.map((error) => error.description).join(" ");
    case "rejected":
      return "The Bridge would not make that change.";
    case "unknown":
      return COULD_NOT_CONFIRM_MESSAGE;
  }
}

export function messageForError(error: ApiError): string {
  if (error.code === "MUTATION_OUTCOME_UNKNOWN") {
    return COULD_NOT_CONFIRM_MESSAGE;
  }

  return error.message;
}
