/**
 * Issue #10's layer 3, case 3: an API error returning JSON, not the SPA
 * shell.
 *
 * `apps/console/nginx.conf` is deliberate about this: `location /` falls
 * through to `index.html` via `try_files` for any client-side route, but
 * `location /api/` never does — an unknown API path reaches the Console
 * API's own catch-all (`unservedPath` in `http/app.ts`), which answers in the
 * same JSON envelope every other error does. Handing a browser `index.html`
 * for a bad API path would be a 200 a client-side `fetch` reads as success.
 */
import { expect, test } from "@playwright/test";

test("an unknown /api/v1 path answers the JSON error envelope, not HTML", async ({ request }) => {
  // No sign-in: `app.ts` mounts `requireSession` only ahead of `/lights` and
  // `/events`, not the catch-all — an unauthenticated request reaches
  // `unservedPath` exactly the same as a signed-in one does, which is itself
  // part of what this spec is proving.
  const response = await request.get("/api/v1/this-does-not-exist");

  expect(response.status()).toBe(400);
  expect(response.headers()["content-type"]).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "INVALID_REQUEST" },
  });
});

test("an unknown page route still falls through to the SPA shell", async ({ request }) => {
  // The contrast that makes the case above meaningful: this is what `/api/`
  // deliberately does not do for its own unknown paths.
  const response = await request.get("/this-page-does-not-exist");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  const body = await response.text();
  expect(body).toContain('<div id="root">');
});
