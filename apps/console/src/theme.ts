/**
 * Chakra's default system with the "Hue Dashboard" design's two departures
 * from it: Plus Jakarta Sans (loaded in index.html), and Chakra's own
 * `gray.50` as the page ground. Every colour the Console uses is a Chakra
 * token — `blue.500`, `gray.100` and so on — which is what the design's hex
 * values were to begin with.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const FONT = `"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

const config = defineConfig({
  globalCss: {
    html: {
      colorScheme: "light",
    },
    body: {
      bg: "gray.50",
      color: "gray.800",
      fontSize: "14px",
      fontSmooth: "antialiased",
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: FONT },
        body: { value: FONT },
      },
      shadows: {
        card: {
          value: "0 1px 2px rgba(16, 24, 40, 0.06), 0 6px 20px rgba(16, 24, 40, 0.05)",
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
