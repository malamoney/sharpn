/**
 * What a failure reaches a browser as.
 *
 * One table, in one place, for the same reason the Gateway keeps one: the
 * distinctions it draws are the ones a person acts on — fix the request,
 * press the button, wait, or call whoever deployed this — and spread across
 * the routes they would drift apart.
 *
 * Every code is carried in the same envelope, and `detail` is whoever refused,
 * in their own words: Hue's or the Gateway's verbatim when the refusal came
 * from there, the Console API's when it refused before sending anything. No
 * code is ever derived by reading that prose.
 */
import { z } from "zod";

/** What one code means, and what it is answered with. */
export interface ErrorDefinition {
  /** The HTTP status this code is always sent with. */
  httpStatus: number;
  /** Whether the response also carries a `Retry-After`. */
  retryAfter: boolean;
  /** What it means, as the OpenAPI document describes it. */
  meaning: string;
}

/**
 * Every code the Console API can answer with.
 *
 * The order is the table in issue #2: what the Gateway's statuses become
 * first, then what the Console API refuses on its own.
 */
export const ERROR_CODES = [
  "BRIDGE_REJECTED_COMMAND",
  "LIGHT_NOT_FOUND",
  "GATEWAY_NOT_PAIRED",
  "BRIDGE_UNREACHABLE",
  "BRIDGE_TIMEOUT",
  "MUTATION_OUTCOME_UNKNOWN",
  "BRIDGE_BUSY",
  "BRIDGE_UNSUPPORTED",
  "GATEWAY_MISCONFIGURED",
  "GATEWAY_ERROR",
  "GATEWAY_UNREACHABLE",
  "NOT_AUTHENTICATED",
  "CSRF_REJECTED",
  "TOO_MANY_REQUESTS",
  "INVALID_REQUEST",
  "COLOR_AND_TEMPERATURE_BOTH_SET",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ERRORS: Record<ErrorCode, ErrorDefinition> = {
  BRIDGE_REJECTED_COMMAND: {
    httpStatus: 400,
    retryAfter: false,
    meaning:
      "The Bridge or the Gateway refused the command, and nothing changed. " +
      "`detail` says which value it objected to.",
  },
  LIGHT_NOT_FOUND: {
    httpStatus: 404,
    retryAfter: false,
    meaning: "The Bridge knows no Light with that id.",
  },
  GATEWAY_NOT_PAIRED: {
    httpStatus: 503,
    retryAfter: false,
    meaning:
      "The Gateway is not paired with a Bridge, or its Application Key has " +
      "been revoked and pairing has to be done again. Somebody has to walk " +
      "to the Bridge; `detail` carries the Gateway's own instructions.",
  },
  BRIDGE_UNREACHABLE: {
    httpStatus: 503,
    retryAfter: false,
    meaning: "The Gateway could not reach the Bridge.",
  },
  BRIDGE_TIMEOUT: {
    httpStatus: 504,
    retryAfter: false,
    meaning:
      "A read took too long. The Gateway had already retried it, and nothing " +
      "was changed by asking.",
  },
  MUTATION_OUTCOME_UNKNOWN: {
    httpStatus: 504,
    retryAfter: false,
    meaning:
      "An update took too long, so the Command may have been applied and the " +
      "reply lost. This is not a failure and must not be reported as one — " +
      "read the Light to find out what it is now.",
  },
  BRIDGE_BUSY: {
    httpStatus: 503,
    retryAfter: true,
    meaning:
      "The Bridge is rate limiting the Gateway. Deliberately not a 429: a " +
      "429 from the Console API only ever means the browser is going too " +
      "fast.",
  },
  BRIDGE_UNSUPPORTED: {
    httpStatus: 501,
    retryAfter: false,
    meaning:
      "The Bridge does not serve this at all — older firmware, or a model " +
      "that cannot do it. Asking again will not change that.",
  },
  GATEWAY_MISCONFIGURED: {
    httpStatus: 500,
    retryAfter: false,
    meaning:
      "The Gateway rejected the Console API's Gateway Token. A deployment " +
      "fault, and deliberately not a 401: the browser has no credential to " +
      "fix.",
  },
  GATEWAY_ERROR: {
    httpStatus: 502,
    retryAfter: false,
    meaning: "The Gateway failed in a way nothing here anticipated.",
  },
  GATEWAY_UNREACHABLE: {
    httpStatus: 503,
    retryAfter: false,
    meaning:
      "This API could not reach the Gateway at all — the channel is down, " +
      "or its certificate did not verify.",
  },
  NOT_AUTHENTICATED: {
    httpStatus: 401,
    retryAfter: false,
    meaning: "No session, or one that has expired. Sign in again.",
  },
  CSRF_REJECTED: {
    httpStatus: 403,
    retryAfter: false,
    meaning: "A mutation arrived without the CSRF token its session expects.",
  },
  TOO_MANY_REQUESTS: {
    httpStatus: 429,
    retryAfter: true,
    meaning: "This browser is going too fast. Reads are not metered.",
  },
  INVALID_REQUEST: {
    httpStatus: 400,
    retryAfter: false,
    meaning:
      "The request body is not a Command the Console API can send: a key it " +
      "does not know, a number out of range, a `null`, or nothing to change.",
  },
  COLOR_AND_TEMPERATURE_BOTH_SET: {
    httpStatus: 400,
    retryAfter: false,
    meaning:
      "One command asked for both a colour and a colour temperature. They " +
      "are a protobuf oneof on the wire, where setting both silently keeps " +
      "one, so the request is refused rather than half-applied.",
  },
};

/**
 * The envelope every error is carried in.
 *
 * `message` is the Console API's own words and is safe to show a person.
 * `detail` is
 * whoever refused, verbatim — the Gateway's prose, Hue's own description, or
 * the Console API's account of what was wrong with the body — and is present
 * only
 * when there is something to add.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    detail: z.string().optional(),
    correlationId: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * Which kind of call failed.
 *
 * The only thing that reads it is a deadline: a read that timed out changed
 * nothing, and an update that timed out may have changed everything.
 */
export type CallKind = "read" | "update";

/**
 * What the Console API calls a channel that is not up.
 *
 * Not a gRPC status — there is no RPC to carry one — but it arrives at the
 * same place and is translated by the same table.
 */
export const CHANNEL_DOWN = "CHANNEL_DOWN";

/**
 * The code for a gRPC status name, or for the channel being down.
 *
 * The Gateway's `FAILED_PRECONDITION` has three causes — never paired, link
 * button not pressed, and the Bridge rejecting a revoked Application Key —
 * that are distinguishable only by prose. They share one code, and the prose
 * travels in `detail`; it was written to be actionable and is not parsed here.
 */
const BY_FAILURE: Record<string, ErrorCode | Record<CallKind, ErrorCode>> = {
  INVALID_ARGUMENT: "BRIDGE_REJECTED_COMMAND",
  NOT_FOUND: "LIGHT_NOT_FOUND",
  FAILED_PRECONDITION: "GATEWAY_NOT_PAIRED",
  UNAVAILABLE: "BRIDGE_UNREACHABLE",
  DEADLINE_EXCEEDED: {
    read: "BRIDGE_TIMEOUT",
    update: "MUTATION_OUTCOME_UNKNOWN",
  },
  RESOURCE_EXHAUSTED: "BRIDGE_BUSY",
  UNIMPLEMENTED: "BRIDGE_UNSUPPORTED",
  UNAUTHENTICATED: "GATEWAY_MISCONFIGURED",
  INTERNAL: "GATEWAY_ERROR",
  [CHANNEL_DOWN]: "GATEWAY_UNREACHABLE",
};

/**
 * The code a Gateway failure is reported under.
 *
 * `failure` is a gRPC status *name* — `status[code]` from `@grpc/grpc-js` —
 * or `CHANNEL_DOWN`, so that this table can be read without a gRPC library
 * and the Console can import it. A status this table does not carry is the
 * Gateway failing in a way nothing here anticipated, and becomes
 * `GATEWAY_ERROR`; picking the closest-looking row instead would be inventing
 * a meaning for it.
 */
export function errorCodeForGatewayFailure(
  failure: string,
  call: CallKind,
): ErrorCode {
  const mapped = BY_FAILURE[failure];
  if (mapped === undefined) {
    return "GATEWAY_ERROR";
  }

  return typeof mapped === "string" ? mapped : mapped[call];
}
