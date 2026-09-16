/**
 * Which brand of bulb a Light is. Every Light is a Philips Hue bulb today,
 * because the Hue Gateway is the only thing the Console API talks to —
 * so `Light` carries no vendor field (issue #31: a field that is always
 * "hue" is a contract change spent on nothing), and this is the one place
 * that assumption lives. When a second brand arrives and the contract does
 * say which is which, this function reads it and the card need not change.
 */
import type { Light } from "../api/types.js";

export type Brand = "hue";

export function brandOf(_light: Light): Brand {
  return "hue";
}
