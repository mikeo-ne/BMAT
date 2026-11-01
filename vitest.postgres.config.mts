import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/postgres/**/*.spec.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 45000,
    hookTimeout: 120000,
  },
});
