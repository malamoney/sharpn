/**
 * What can be wrong between a browser and a Light, and telling the three
 * outage causes issue #7 asks for apart: the Console API unreachable, a
 * `GATEWAY_UNREACHABLE` answered by it, and `BRIDGE_UNREACHABLE` or
 * `GATEWAY_NOT_PAIRED` answered by it. Each names a different thing being
 * down — the Console API, the channel to the Gateway, or the Gateway's own
 * link to the Bridge — and `CONTEXT.md`'s three tiers exist so a person can
 * be told which.
 */
import type { ErrorCode } from "./types.js";

/** A refusal the Console API answered with, in its own envelope. */
export class ApiError extends Error {
  code: ErrorCode;
  detail?: string;
  correlationId: string;
  retryAfterSeconds?: number;

  constructor(refusal: {
    code: ErrorCode;
    message: string;
    detail?: string;
    correlationId: string;
    retryAfterSeconds?: number;
  }) {
    super(refusal.message);
    this.name = "ApiError";
    this.code = refusal.code;
    this.detail = refusal.detail;
    this.correlationId = refusal.correlationId;
    this.retryAfterSeconds = refusal.retryAfterSeconds;
  }
}

export type Outage =
  /** `fetch` itself never got an answer: no Console API to ask at all. */
  | { kind: "console_api_unreachable" }
  /** The Console API answered, but it could not reach the Gateway at all. */
  | { kind: "gateway_unreachable"; error: ApiError }
  /** The Gateway answered, but has no Bridge to relay to right now. */
  | { kind: "bridge_unreachable"; error: ApiError }
  /** Anything else this failed for. */
  | { kind: "other"; error: ApiError | undefined };

const BRIDGE_UNREACHABLE_CODES: readonly ErrorCode[] = [
  "BRIDGE_UNREACHABLE",
  "GATEWAY_NOT_PAIRED",
];

/**
 * Which of the outage causes a caught failure is, or `other` for anything
 * that is not one of the three — including a code like `LIGHT_NOT_FOUND`,
 * which is not an outage at all.
 */
export function classifyOutage(error: unknown): Outage {
  if (error instanceof ApiError) {
    if (error.code === "GATEWAY_UNREACHABLE") {
      return { kind: "gateway_unreachable", error };
    }

    if (BRIDGE_UNREACHABLE_CODES.includes(error.code)) {
      return { kind: "bridge_unreachable", error };
    }

    return { kind: "other", error };
  }

  // `fetch` rejects with a `TypeError` when it cannot complete the exchange
  // at all — no response, malformed or otherwise, for an `ApiError` to have
  // been built from. That is the one failure this service never answered.
  if (error instanceof TypeError) {
    return { kind: "console_api_unreachable" };
  }

  return { kind: "other", error: undefined };
}

/**
 * What a person is told for each outage cause — the three issue #7 asks to
 * be told apart, naming which of the three tiers `CONTEXT.md` describes is
 * the one that is down.
 */
export function messageForOutage(outage: Outage): string {
  switch (outage.kind) {
    case "console_api_unreachable":
      return "Can't reach the Console API. Check the connection to this device.";
    case "gateway_unreachable":
      return "The Console API can't reach the Gateway at all.";
    case "bridge_unreachable":
      return outage.error.detail ?? outage.error.message;
    case "other":
      return outage.error?.message ?? "Something went wrong that this Console did not expect.";
  }
}
