/**
 * The three routes nobody's browser asks for.
 *
 * Not under `/api/v1` and not in the OpenAPI document: the document is the
 * contract between the Console and the Console API, and these are between this
 * process and whoever is running it. A browser has no use for any of them.
 */
import { Router } from "express";

import type { Readiness } from "../readiness.js";
import type { Version } from "../version.js";

/** What the operator routes need from the process around them. */
export interface HealthRouteParts {
  readiness: Readiness;
  version: Version;
}

export function healthRoutes({ readiness, version }: HealthRouteParts): Router {
  const routes = Router();

  /**
   * That the process is running, and nothing else.
   *
   * It asks nothing of the Gateway on purpose. A liveness probe that fails
   * when a dependency is down is a probe that restarts a healthy process
   * because something else broke, and restarting this one has never fixed a
   * Gateway.
   */
  routes.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });

  /**
   * That this process can do its job: the channel is up and a subscription is
   * established.
   *
   * Nothing more. Whether a Bridge can be reached is not asserted here — it is
   * a 503 on a route, not a reason to take this process out of service — and
   * the Gateway's own health service could not tell us anyway.
   */
  routes.get("/readyz", (_request, response) => {
    const channel = readiness.channelConnected();
    const subscribed = readiness.subscribed();

    response.status(channel && subscribed ? 200 : 503).json({
      ready: channel && subscribed,
      channel: channel ? "connected" : "disconnected",
      subscription: subscribed ? "established" : "lost",
    });
  });

  /** Which checkout is running, and which contract it was built against. */
  routes.get("/version", (_request, response) => {
    response.json(version);
  });

  return routes;
}
