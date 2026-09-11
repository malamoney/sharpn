/**
 * The three routes a browser has for Lights.
 *
 * Each one is the same three steps — decide whether to send, send, say what
 * came back — and the interesting half is the deciding. A Command is checked
 * before anything leaves, because the two things that can go wrong at that
 * point are wrong in ways the Bridge would not report: a body with both halves
 * of the colour oneof arrives at the Gateway as a message with one of them
 * silently dropped, and a body arriving faster than the meter allows is a
 * Bridge being hammered on a browser's behalf.
 *
 * Nothing is cached and nothing is remembered. A read goes to the Bridge and
 * comes back with what the Bridge said, which is the only reason a Console
 * reacting to an Invalidation learns anything.
 */
import { Router, type Request } from "express";

import { readLightCommand } from "../contract/index.js";
import { mintCorrelationId, type Gateway } from "../gateway/index.js";
import { answer, refuse } from "./answer.js";
import type { Meter } from "./meter.js";

/** What the Light routes need from the process around them. */
export interface LightRouteParts {
  gateway: Gateway;
  /** Consulted before a Mutation is sent, and never before a read. */
  meter: Meter;
  /**
   * What a Mutation is counted against.
   *
   * A seam, because the thing it should be — the signed cookie's session — is
   * not built yet. Until it is, a request is counted against where it came
   * from, which is the browser's address when exactly one proxy is in front of
   * this process and the proxy's own otherwise.
   */
  sessionOf(request: Request): string;
}

export function lightRoutes({
  gateway,
  meter,
  sessionOf,
}: LightRouteParts): Router {
  const routes = Router();

  routes.get("/lights", async (_request, response) => {
    const result = await gateway.listLights();
    if (!result.ok) {
      refuse(response, result);
      return;
    }

    answer(response, result.correlationId, result.value);
  });

  routes.get("/lights/:id", async (request, response) => {
    const result = await gateway.getLight(request.params.id);
    if (!result.ok) {
      refuse(response, result);
      return;
    }

    answer(response, result.correlationId, result.value);
  });

  routes.patch("/lights/:id", async (request, response) => {
    // Metered before the body is read, not after. A browser sending sixty
    // malformed Commands a minute is the thing the meter is for as much as a
    // browser sending sixty good ones, and a limit that only counts the valid
    // ones is a limit on nothing.
    const spend = meter.spend(sessionOf(request));
    if (!spend.allowed) {
      refuse(response, {
        code: "TOO_MANY_REQUESTS",
        correlationId: mintCorrelationId(),
        retryAfterSeconds: spend.retryAfterSeconds,
      });
      return;
    }

    // ADR 0005's second guard is inside this: a body carrying both a colour
    // and a colour temperature is refused here, before a `LightPut` is built,
    // because building one would keep whichever came second and discard the
    // other with no error anywhere.
    const reading = readLightCommand(request.body);
    if (!reading.ok) {
      refuse(response, {
        code: reading.code,
        // Nothing reached the Gateway, so there is no RPC whose id to quote
        // and this request needs one of its own.
        correlationId: mintCorrelationId(),
        detail: reading.detail,
      });
      return;
    }

    const result = await gateway.updateLight(
      request.params.id,
      reading.command,
    );
    if (!result.ok) {
      refuse(response, result);
      return;
    }

    // An Acknowledgement, which names Resources and carries no state. An
    // `outcome` of `rejected` leaves here as a 200: the request was well
    // formed and the Gateway answered it, and a 4xx would be this service
    // telling a person they did something wrong when the Bridge did the
    // refusing (ADR 0001).
    answer(response, result.correlationId, result.value);
  });

  return routes;
}
