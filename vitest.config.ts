import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests only — tests/ui/* are Playwright specs run by the Playwright CLI.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});

