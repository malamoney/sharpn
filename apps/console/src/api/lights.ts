/**
 * The three routes a browser has for Lights (`http/lights.ts`).
 *
 * `updateLight` answers with an Acknowledgement and never with a Light — ADR
 * 0001 — which is why nothing here tries to fold its answer into a Light the
 * caller already has.
 */
import { get, patch } from "./client.js";
import type { Acknowledgement, Light, LightCommand } from "./types.js";

export function listLights(): Promise<Light[]> {
  return get<Light[]>("/lights");
}

export function getLight(id: string): Promise<Light> {
  return get<Light>(`/lights/${encodeURIComponent(id)}`);
}

export function updateLight(
  id: string,
  command: LightCommand,
): Promise<Acknowledgement> {
  return patch<Acknowledgement>(`/lights/${encodeURIComponent(id)}`, command);
}
