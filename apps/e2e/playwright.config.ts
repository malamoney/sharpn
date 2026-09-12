import { defineConfig } from "@playwright/test";

/**
 * Issue #10's layer 3: four specs, not a suite, for the cases where the
 * Console, Nginx, the Console API and SSE all have to be right at once — a
 * run that bypassed Nginx would test nothing new. Runs against
 * docker-compose.e2e.yml, brought up by `scripts/e2e.sh up`.
 */
export default defineConfig({
  testDir: "./playwright",
  timeout: 30_000,
  // Every spec shares one login rate limit (LOGIN_ATTEMPTS_PER_MINUTE = 5,
  // http/meter.ts) against the one console-api container — running specs
  // concurrently would have them fight each other for it.
  workers: 1,
  retries: 0,
  // "never" rather than the default "on-failure": CI's own artifact-upload
  // step is what a failure needs, and opening a local HTML report is not a
  // step this repo's workflow otherwise has any use for.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "https://localhost",
    // The e2e stack's certificate is self-signed and untrusted by design
    // (scripts/e2e-secrets.sh, ADR 0004's shape) — there is no CA a real
    // browser would trust to mint for a throwaway stack instead.
    ignoreHTTPSErrors: true,
  },
});
