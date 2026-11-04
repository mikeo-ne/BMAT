import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps jsx:"preserve" for Next; the test runner must compile JSX
  // itself, so override the transform rather than the shared tsconfig.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // Node by default; individual files opt into jsdom with a
    // `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    reporters: "default",
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, ".") },
  },
});
