/**
 * The adapter, and the shapes a caller needs to read what it answers.
 *
 * Nothing protobuf is exported from here, and nothing outside this directory
 * imports from `src/gen`. That is the whole arrangement: the Console API above
 * this line deals in Lights, Commands and Acknowledgements, and the one place
 * that knows those are carried as `LightGet` and `LightPut` is inside.
 */
export { connectToGateway, UNARY_DEADLINE_MS } from "./adapter.js";
// The Correlation ID is minted here for every call, and the tiers above need
// one of their own for the requests that never reach the Gateway. Same mint,
// so that an id quoted in an error envelope looks like every other id.
export { mintCorrelationId } from "./correlation.js";
export type {
  Gateway,
  GatewayConfig,
  Keepalive,
  Subscriber,
  Subscription,
} from "./adapter.js";
export type { Gap, Invalidation, Notice } from "./codec.js";
export type { GatewayResult } from "./status.js";
