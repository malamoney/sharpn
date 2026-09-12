/** Shared setup for the browser-driven layer-3 specs. */
import type { Page } from "@playwright/test";

import { PASSWORD } from "./http.js";

// fake-hue's own defaults (tools/fake_hue/bridge.py's DEFAULT_LIGHTS).
export const DESK = "Desk";
export const DESK_ID = "bbbbbbbb-0000-4000-8000-000000000001";
export const SHELF = "Shelf";

/** Signs in through the real login form, and waits for the light list. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText(DESK).waitFor();
}
