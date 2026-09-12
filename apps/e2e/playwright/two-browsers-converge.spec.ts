/**
 * Issue #10's layer 3, case 1: two browsers converging.
 *
 * A change one person makes has to reach the other's screen with no manual
 * refresh — the whole reason the Console holds an SSE connection open rather
 * than polling. Both browsers sit on the light's own detail page rather than
 * the list: `LiveLightsProvider`'s own comment is explicit that a
 * `light.changed` Invalidation carries an id only (ADR 0002) and invalidates
 * that Light's detail query, not the list — the list re-sorts only on an
 * add/remove. The detail page is where live convergence is actually promised.
 */
import { expect, test } from "@playwright/test";

import { DESK_ID, signIn } from "../support/ui.js";

test("a change in one browser appears in another via SSE, with no manual refresh", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signIn(pageA);
    await signIn(pageB);
    await pageA.goto(`/lights/${DESK_ID}`);
    await pageB.goto(`/lights/${DESK_ID}`);

    const toggleA = pageA.getByRole("switch");
    const toggleB = pageB.getByRole("switch");
    await toggleA.waitFor();
    await toggleB.waitFor();

    const before = await toggleB.isChecked();

    await toggleA.click();
    await expect(toggleA).toBeChecked({ checked: !before });

    // Nothing here reloads or interacts with browser B — the only path from
    // A's click to B's screen is the Bridge's own Invalidation, over SSE.
    await expect(toggleB).toBeChecked({ checked: !before, timeout: 10_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
