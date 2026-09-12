import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["gateway/**/*.e2e.test.ts"],
    // The docker-stop/restart case polls the fake Bridge's own healthcheck on
    // top of a handful of retried HTTP requests; the default 5s is tight for
    // that round trip.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
