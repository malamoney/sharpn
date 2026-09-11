/**
 * What the adapter answers with, and what a failed RPC becomes.
 *
 * The translation table itself lives in the contract, beside the HTTP statuses
 * the codes are sent with, because the Console imports it too. What lives here
 * is the one thing the table cannot state: which of the two meanings of
 * `UNAVAILABLE` a particular failure carried.
 */
import { status, type Metadata, type ServiceError } from "@grpc/grpc-js";

import {
  CHANNEL_DOWN,
  errorCodeForGatewayFailure,
  type CallKind,
  type ErrorCode,
} from "../contract/errors.js";

/**
 * What every call to the Gateway answers with.
 *
 * A result rather than a thrown error, for the reason `readLightCommand` gives
 * for returning one: which code a failure is reported under is part of the
 * contract, and deciding it here rather than in a `catch` keeps a route from
 * having to. The Correlation ID is on both arms — it identifies the RPC, which
 * happened whether or not it worked.
 */
export type GatewayResult<T> =
  | { ok: true; correlationId: string; value: T }
  | { ok: false; correlationId: string; code: ErrorCode; detail?: string };

/**
 * The code and the prose a failed RPC is reported under.
 *
 * `detail` is whoever refused, verbatim. The Gateway's `FAILED_PRECONDITION`
 * has three causes — never paired, link button not pressed, and a revoked
 * Application Key — that are distinguishable only by that prose, and it is
 * passed through rather than parsed: it was written to be actionable, and a
 * code derived by reading it would be a code that changes when somebody
 * rewords a sentence.
 */
export function failureFrom(
  error: ServiceError,
  call: CallKind,
): { code: ErrorCode; detail?: string } {
  const failure = wasSentByTheGateway(error)
    ? (status[error.code] ?? "")
    : CHANNEL_DOWN;

  return {
    code: errorCodeForGatewayFailure(failure, call),
    detail: error.details === "" ? undefined : error.details,
  };
}

/**
 * Whether the status came from the Gateway or from the channel underneath it.
 *
 * `UNAVAILABLE` is the collision the table has two rows for: the Gateway sends
 * it when it cannot reach the Bridge, and `grpc-js` produces the same code
 * itself when there is no connection to a Gateway at all — nothing listening,
 * a name that does not resolve, or a certificate that did not verify. They are
 * a 503 either way, but they name different broken machines, and a person
 * being told which is the whole point of the two codes.
 *
 * The evidence is the trailers. A status the Gateway sent arrives with the
 * response headers that carried it — `content-type` at the least, because
 * every gRPC response has one — where a status `grpc-js` invented for itself
 * arrives with none. This is checked rather than the channel's connectivity
 * state, which is the other candidate and is worse: the state is read after
 * the fact and may have changed, where the trailers belong to this RPC.
 *
 * It is asked only of a status that could have been generated locally. Every
 * other code in the table is one only a server sends, and `DEADLINE_EXCEEDED`
 * in particular is always the client's own doing — reading it as a dead
 * channel would turn every timed-out update into the wrong answer.
 */
function wasSentByTheGateway(error: ServiceError): boolean {
  if (error.code !== status.UNAVAILABLE) {
    return true;
  }

  return hasAny(error.metadata);
}

function hasAny(metadata: Metadata | undefined): boolean {
  return metadata !== undefined && Object.keys(metadata.getMap()).length > 0;
}
