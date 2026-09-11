/**
 * How a response leaves: the envelope, the headers, and the Console API's own
 * words for every code.
 *
 * One place, because the two things a browser can rely on are that every
 * failure has the same shape and that every response says which request it
 * was. Neither survives being written out at each route.
 *
 * The wording here is separate from the `meaning` in `contract/errors.ts` on
 * purpose. That prose is the OpenAPI document's — it explains to whoever is
 * writing a client why a code exists and why it is not some other status. This
 * is what a person is shown, and it is the Console API's own account rather
 * than anybody else's: whoever refused travels beside it, verbatim, in
 * `detail`.
 */
import type { Response } from "express";

import {
  ERRORS,
  type ErrorCode,
  type ErrorEnvelope,
} from "../contract/index.js";
import { mintCorrelationId, type GatewayResult } from "../gateway/index.js";

/**
 * What a person is told, per code.
 *
 * Exhaustive by construction: a code added to the catalogue and not to this
 * table is a compile error, which is the only way a new code cannot reach a
 * browser with nothing to read.
 */
const MESSAGES: Record<ErrorCode, string> = {
  BRIDGE_REJECTED_COMMAND: "The Bridge would not make that change.",
  LIGHT_NOT_FOUND: "There is no light with that id.",
  GATEWAY_NOT_PAIRED:
    "The Gateway is not paired with a Bridge. Somebody has to press the " +
    "button on the Bridge itself.",
  BRIDGE_UNREACHABLE: "The Gateway could not reach the Bridge.",
  BRIDGE_TIMEOUT:
    "Reading from the Bridge took too long. Nothing was changed by asking.",
  // Never the word "failed". The Command may well have been applied and the
  // reply lost, and a person told it failed will send it again (ADR 0001).
  MUTATION_OUTCOME_UNKNOWN:
    "That change took too long to answer for, so nobody knows yet whether it " +
    "was made. Read the light to see what it is now.",
  BRIDGE_BUSY: "The Bridge is being asked for too much at once.",
  BRIDGE_UNSUPPORTED: "This Bridge does not do that.",
  GATEWAY_MISCONFIGURED:
    "This service is not set up to talk to the Gateway. Nothing done in a " +
    "browser will fix it.",
  GATEWAY_ERROR: "The Gateway failed in a way this service did not expect.",
  GATEWAY_UNREACHABLE: "This service could not reach the Gateway at all.",
  NOT_AUTHENTICATED: "You are not signed in.",
  CSRF_REJECTED: "That change did not come from a page this service served.",
  TOO_MANY_REQUESTS:
    "That is more changes than this service will pass on in a minute.",
  INVALID_REQUEST: "That is not a request this service can serve.",
  COLOR_AND_TEMPERATURE_BOTH_SET:
    "A colour and a colour temperature cannot be set in one change. Send one " +
    "or the other.",
};

/**
 * How long to wait when the answer is "wait" and nobody said how long.
 *
 * The Bridge rate limits the Gateway and reports no budget with the refusal,
 * so there is nothing to derive a number from. A second is the shortest wait
 * that is not the retry storm the header exists to prevent.
 */
const RETRY_AFTER_SECONDS = 1;

/** The key the Correlation ID rides back on, which is the one it came in on. */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/** A failure, ready to be written. */
interface Refusal {
  code: ErrorCode;
  /**
   * Which request this was. The RPC's own id where one was made, so that the
   * Console API's line and the Gateway's journal name the same request, and a
   * freshly minted one where nothing reached the Gateway.
   */
  correlationId: string;
  /** Whoever refused, verbatim, where there is anybody to quote. */
  detail?: string;
  /**
   * Read only for the codes the catalogue says carry a `Retry-After`. A caller
   * that knows the wait exactly — the Mutation meter does — passes it; nobody
   * else has to.
   */
  retryAfterSeconds?: number;
}

/**
 * Writes a failure: the status the catalogue gives the code, and the
 * envelope every one of them arrives in.
 */
function refuse(response: Response, refusal: Refusal): void {
  const { httpStatus, retryAfter } = ERRORS[refusal.code];

  response.setHeader(CORRELATION_ID_HEADER, refusal.correlationId);
  if (retryAfter) {
    response.setHeader(
      "Retry-After",
      String(refusal.retryAfterSeconds ?? RETRY_AFTER_SECONDS),
    );
  }

  const envelope: ErrorEnvelope = {
    error: {
      code: refusal.code,
      message: MESSAGES[refusal.code],
      // Omitted rather than null when there is nobody to quote: the schema
      // says `detail` is present only when there is something to add.
      ...(refusal.detail === undefined ? {} : { detail: refusal.detail }),
      correlationId: refusal.correlationId,
    },
  };

  response.status(httpStatus).json(envelope);
}

/**
 * Writes whatever the Gateway said, whichever way it went.
 *
 * The two arms of a `GatewayResult` are the same two arms of a response, and
 * writing them out at each route is how the third route comes to differ from
 * the first two by accident. The Correlation ID on both is the RPC's own, so
 * the line this service logs and the line in the Gateway's journal name one
 * request — and two browsers whose reads were shared quote one id between
 * them, which is the truthful answer.
 */
export function relay(
  response: Response,
  result: GatewayResult<unknown>,
): void {
  if (!result.ok) {
    refuse(response, result);
    return;
  }

  response.setHeader(CORRELATION_ID_HEADER, result.correlationId);
  response.json(result.value);
}

/**
 * Writes a failure for a request that never reached the Gateway.
 *
 * There is no RPC whose id to quote, so this request is minted one of its own
 * — which is the only reason the two are separate functions. Everything
 * refused here was refused on this service's own account: a body it would not
 * read, a Command it would not send, a session going faster than it will pass
 * on.
 */
export function refuseWithoutAsking(
  response: Response,
  refusal: Omit<Refusal, "correlationId">,
): void {
  refuse(response, { ...refusal, correlationId: mintCorrelationId() });
}
