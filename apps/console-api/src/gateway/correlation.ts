/**
 * The Correlation ID, and the metadata it travels in.
 *
 * One is minted per request and sent as `x-correlation-id`, which is the key
 * the Gateway's `ObservabilityInterceptor` reads: it is what makes a line in
 * the Console API's log and a line in the Gateway's journal findable as the
 * same request. It is also what the error envelope carries, so that a person
 * reporting a failure is quoting something that can be looked up.
 */
import { randomUUID } from "node:crypto";

/** The key the Gateway reads. Lower-case, because gRPC metadata keys are. */
export const CORRELATION_ID_KEY = "x-correlation-id";

/** A Correlation ID for one request to the Gateway. */
export function mintCorrelationId(): string {
  return randomUUID();
}
