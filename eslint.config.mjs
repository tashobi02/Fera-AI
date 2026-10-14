import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Defaults of eslint-config-next
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored agent kit, spec pack and prototype: not app code
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".gemini/**",
    ".specify/**",
    "third_party/**",
    "docs/**",
    "demo/**",
    "graphify-out/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
