import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In production Nginx serves the Console's own files and the Console
      // API from one origin (README's "Shape" diagram), which is what makes
      // a same-origin cookie and the CSRF Origin check both work without
      // either tier knowing about the other's address. This is the same
      // arrangement for `npm run dev`: proxied rather than cross-origin, so
      // `fetch("/api/v1/...")` behaves the same way it will once built.
      "/api": "http://localhost:3000",
    },
  },
});
