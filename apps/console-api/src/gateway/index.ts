/**
 * The adapter, and the shapes a caller needs to read what it answers.
 *
 * Nothing protobuf is exported from here, and nothing outside this directory
 * imports from `src/gen`. That is the whole arrangement: the Console API above
 * this line deals in Lights, Commands and Acknowledgements, and the one place
 * that knows those are carried as `LightGet` and `LightPut` is inside.
 */
export { connectToGateway, UNARY_DEADLINE_MS } from "./adapter.js";
export type {
  Gateway,
  GatewayConfig,
  Subscriber,
  Subscription,
} from "./adapter.js";
export type { GatewayEvent } from "./codec.js";
export type { GatewayResult } from "./status.js";
