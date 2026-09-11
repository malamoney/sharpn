/**
 * The three routes a browser has for Lights.
 *
 * Each one is the same three steps — decide whether to send, send, say what
 * came back — and the deciding is the half worth reading. A Command is checked
 * before anything leaves, because what can be wrong with one at that point is
 * wrong in a way the Bridge would not report: a body with both halves of the
 * colour oneof reaches the Gateway as a message with one of them silently
 * dropped.
 *
 * Nothing is cached and nothing is remembered. A read goes to the Bridge and
 * comes back with what the Bridge said, which is the only reason a Console
 * reacting to an Invalidation learns anything.
 */
import { Router } from "express";

import { readLightCommand } from "../contract/index.js";
import type { Gateway } from "../gateway/index.js";
import { refuseWithoutAsking, relay } from "./answer.js";

/** What the Light routes need from the process around them. */
export interface LightRouteParts {
  gateway: Gateway;
}

export function lightRoutes({ gateway }: LightRouteParts): Router {
  const routes = Router();

  routes.get("/lights", async (_request, response) => {
    relay(response, await gateway.listLights());
  });

  routes.get("/lights/:id", async (request, response) => {
    relay(response, await gateway.getLight(request.params.id));
  });

  routes.patch("/lights/:id", async (request, response) => {
    // ADR 0005's second guard is inside this: a body carrying both a colour
    // and a colour temperature is refused here, before a `LightPut` is built,
    // because building one would keep whichever came second and discard the
    // other with no error anywhere. The first guard is a compile error in the
    // adapter, and neither is enough alone — this is the one that meets
    // untyped JSON.
    const reading = readLightCommand(request.body);
    if (!reading.ok) {
      refuseWithoutAsking(response, {
        code: reading.code,
        detail: reading.detail,
      });
      return;
    }

    // An Acknowledgement, which names Resources and carries no state. An
    // `outcome` of `rejected` leaves here as a 200: the request was well
    // formed and the Gateway answered it, and a 4xx would be this service
    // telling a person they did something wrong when the Bridge did the
    // refusing (ADR 0001).
    relay(
      response,
      await gateway.updateLight(request.params.id, reading.command),
    );
  });

  return routes;
}
