import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // East Sound: gitignored staging for the GitHub Pages static export, and the
    // file-backed data store. Both hold generated/copied code, not source.
    ".static-build/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
