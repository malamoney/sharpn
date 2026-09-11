/**
 * The only thing in this project that talks to the Gateway.
 *
 * One channel, opened once and reused; the Gateway Token and the pinned
 * certificate on it; a Correlation ID on every call; and the Gateway's
 * statuses translated into the codes the contract defines. What comes out is
 * Lights and Acknowledgements — never a `LightGet`, never a status, never a
 * `ServiceError`.
 */
import {
  Metadata,
  type CallOptions,
  type ServiceError,
} from "@grpc/grpc-js";

import type {
  Acknowledgement,
  CallKind,
  Light,
  LightCommand,
} from "../contract/index.js";
import { ResourceIdentifier_Rtype } from "../gen/hue/v1/common.js";
import {
  EventServiceClient,
  type HueEvent,
} from "../gen/hue/v1/event_service.js";
import {
  LightingServiceClient,
  type ListLightsResponse,
  type MutationResponse,
} from "../gen/hue/v1/lighting_service.js";
import type { LightGet } from "../gen/hue/v1/lighting.js";
import {
  acknowledgementFrom,
  commandFor,
  lightFrom,
  noticeFrom,
  type Notice,
} from "./codec.js";
import { gatewayCredentials, type GatewaySecrets } from "./credentials.js";
import { CORRELATION_ID_KEY, mintCorrelationId } from "./correlation.js";
import { singleFlight } from "./single-flight.js";
import { failureFrom, type GatewayResult } from "./status.js";

/**
 * How long a unary call is given.
 *
 * Five seconds, and deliberately not tighter. The Gateway retries a Safe Read
 * three times with jittered backoff *bounded inside the caller's deadline*, so
 * a shorter deadline does not fail faster — it silently buys fewer retries
 * than the Gateway meant to give, and the Console API would be tuning the
 * Gateway's retry policy by accident.
 */
export const UNARY_DEADLINE_MS = 5_000;

/** Where the Gateway is, and what is needed to be allowed to talk to it. */
export interface GatewayConfig extends GatewaySecrets {
  /** `host:port`, where the host is the name the certificate was issued for. */
  target: string;
}

/**
 * What is told about everything the Bridge is doing, until it stops being.
 *
 * Two callbacks rather than a stream of results: a subscription ends exactly
 * once, and how it ended is a different question from what it carried. A
 * Subscriber that is told the stream ended can decide whether to open another;
 * one that is handed a failure among its events has to notice.
 */
export interface Subscriber {
  /** A Light's copy may be stale, or events may have been missed. */
  onNotice(notice: Notice): void;
  /**
   * The stream ended, once. Cleanly when it was cancelled or the Gateway shut
   * down, and otherwise with the code the Gateway's status translates to.
   */
  onEnded(ending: GatewayResult<void>): void;
}

/** A subscription that is listening until it is not. */
export interface Subscription {
  /** Ends it. The Subscriber is told, cleanly, once the Gateway agrees. */
  cancel(): void;
}

/** Everything the Console API can ask of the Gateway. */
export interface Gateway {
  /** Every Light the Bridge knows about. */
  listLights(): Promise<GatewayResult<Light[]>>;
  /** One Light, by the Resource id the Bridge knows it as. */
  getLight(id: string): Promise<GatewayResult<Light>>;
  /**
   * Changes one Light, and answers with what the Bridge says it did.
   *
   * Never retried, at any level, for any status. A `PUT` that failed after
   * the Bridge acted cannot be told from one that failed before it did, which
   * is why the Gateway refuses to retry a Mutation — and manufacturing a
   * retry in the tier above is the same mistake wearing a different hat.
   */
  updateLight(
    id: string,
    command: LightCommand,
  ): Promise<GatewayResult<Acknowledgement>>;
  /**
   * Every change the Bridge reports, for as long as this listens.
   *
   * No deadline: the Gateway's `DeadlineInterceptor` exempts streaming RPCs on
   * purpose, and setting one here would be fighting that — a subscription is
   * meant to last until it is cancelled, and a Gap is a message on the stream
   * rather than the end of it.
   */
  subscribe(subscriber: Subscriber): Subscription;
  /**
   * Closes the channel, ending every subscription still listening on it.
   *
   * They end cleanly: this process asked to stop, and a Subscriber told
   * otherwise would report an ordinary shutdown as a Gateway failure.
   */
  close(): void;
}

/**
 * Opens the one channel this process makes to the Gateway.
 *
 * One channel, reused for the life of the process, and never one per request:
 * a channel is a connection, a TLS handshake and a backoff state machine, and
 * making one per request would pay for all three every time while throwing
 * away the thing that recovers from a Gateway restart.
 */
export function connectToGateway(config: GatewayConfig): Gateway {
  const credentials = gatewayCredentials(config);
  const lighting = new LightingServiceClient(config.target, credentials, {
    // "No retries on mutations, ever, anywhere" has to be true of the library
    // as well as of this file. grpc-js enables retries by default and applies
    // whatever retry policy arrives in a service config, which is not this
    // process's to see or to veto — so an UpdateLight could be re-sent with
    // nothing here having decided to. Off, and the guarantee holds by
    // construction rather than by the Gateway currently not sending a policy.
    "grpc.enable_retries": 0,
  });
  // The same channel, not a second one: `EventServiceClient` is a second set
  // of typed methods over the one connection this process makes.
  const events = new EventServiceClient(config.target, credentials, {
    channelOverride: lighting.getChannel(),
  });
  // Reads are shared while they are in flight; Mutations never are. A Command
  // that failed after the Bridge acted cannot be told from one that failed
  // before it did, and answering one person's Command with another's
  // Acknowledgement is that ambiguity invented rather than inherited.
  const share = singleFlight();
  // Every subscription still listening, so that closing the channel ends them
  // rather than leaving them holding a connection that has gone. Closing is
  // this process asking to stop, not the Gateway failing at anything, so they
  // are cancelled rather than dropped.
  const listening = new Set<() => void>();

  return {
    async listLights() {
      return share("lights", async () =>
        ask<ListLightsResponse, Light[]>(
          "read",
          (metadata, options, callback) =>
            lighting.listLights({}, metadata, options, callback),
          (response) => response.lights.map(lightFrom),
        ),
      );
    },

    async getLight(id) {
      return share(`light:${id}`, async () =>
        ask<LightGet, Light>(
          "read",
          (metadata, options, callback) =>
            lighting.getLight({ lightId: id }, metadata, options, callback),
          lightFrom,
        ),
      );
    },

    async updateLight(id, command) {
      return ask<MutationResponse, Acknowledgement>(
        "update",
        (metadata, options, callback) =>
          lighting.updateLight(
            { lightId: id, command: commandFor(command) },
            metadata,
            options,
            callback,
          ),
        (response, correlationId) =>
          acknowledgementFrom(response, correlationId),
      );
    },

    subscribe(subscriber) {
      const correlationId = mintCorrelationId();
      const stream = events.subscribe(
        // Lights, because this project models nothing else. The filter is
        // the Gateway's to apply — one upstream connection serves every
        // subscriber — so asking narrowly saves the Console API from reading
        // what it has nothing to do with, and saves the Bridge nothing.
        {
          resourceIds: [],
          resourceTypes: [ResourceIdentifier_Rtype.RTYPE_LIGHT],
        },
        metadataFor(correlationId),
      );

      let cancelled = false;
      let ended = false;
      const stop = () => {
        cancelled = true;
        stream.cancel();
      };
      const end = (ending: GatewayResult<void>) => {
        if (ended) {
          return;
        }

        ended = true;
        listening.delete(stop);
        subscriber.onEnded(ending);
      };

      listening.add(stop);

      stream.on("data", (event: HueEvent) => {
        const notice = noticeFrom(event);
        if (notice !== undefined) {
          subscriber.onNotice(notice);
        }
      });
      stream.on("error", (error: ServiceError) => {
        // Cancelling produces a CANCELLED the table has no row for, and it is
        // not a failure: it is this process having asked to stop listening.
        end(
          cancelled
            ? { ok: true, correlationId, value: undefined }
            : { ok: false, correlationId, ...failureFrom(error, "read") },
        );
      });
      stream.on("end", () => {
        end({ ok: true, correlationId, value: undefined });
      });

      return { cancel: stop };
    },

    close() {
      for (const stop of [...listening]) {
        stop();
      }

      // One channel, so one close. `events` rides on the channel `lighting`
      // opened, and closing it twice would be closing something already gone.
      lighting.close();
    },
  };
}

/** The metadata every call carries: the key the Gateway's interceptor reads. */
function metadataFor(correlationId: string): Metadata {
  const metadata = new Metadata();
  metadata.set(CORRELATION_ID_KEY, correlationId);

  return metadata;
}

/**
 * Makes one call, and answers with a result rather than throwing.
 *
 * Every call is minted a Correlation ID and sent with a deadline, because the
 * two are what make a request findable and what stop it hanging — and neither
 * is something a caller should be able to forget.
 */
async function ask<Response, Value>(
  call: CallKind,
  invoke: (
    metadata: Metadata,
    options: CallOptions,
    callback: (error: ServiceError | null, response?: Response) => void,
  ) => void,
  read: (response: Response, correlationId: string) => Value,
): Promise<GatewayResult<Value>> {
  const correlationId = mintCorrelationId();

  return new Promise((resolve) => {
    invoke(
      metadataFor(correlationId),
      { deadline: Date.now() + UNARY_DEADLINE_MS },
      (error, response) => {
        if (error !== null) {
          resolve({ ok: false, correlationId, ...failureFrom(error, call) });
          return;
        }

        if (response === undefined) {
          // Unreachable: grpc-js answers with a response or an error. If it
          // ever does neither, saying so is better than reporting an empty
          // collection as what the Bridge has.
          resolve({
            ok: false,
            correlationId,
            code: "GATEWAY_ERROR",
            detail: "the Gateway answered with neither a response nor a status",
          });
          return;
        }

        resolve({
          ok: true,
          correlationId,
          value: read(response, correlationId),
        });
      },
    );
  });
}
