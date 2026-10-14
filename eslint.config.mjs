import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Contracts boundaries (TASK-061): typed fakes only in tests and fakes; the
  // fera_types_v2.ts companion only in the compile-time test; server contracts never
  // in client components (files under src/app that are not route handlers or server code).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/fakes/**", "src/**/*.test.{ts,tsx}", "src/contracts/examples.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/contracts/examples", "**/contracts/examples"], message: "Typed fakes are for tests/ and fakes/ only." },
            { group: ["**/docs/code/**"], message: "Runtime code must not import the spec companion; use @/contracts." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/contracts/examples", "**/contracts/examples"], message: "Typed fakes are for tests/ and fakes/ only." },
            { group: ["**/docs/code/**"], message: "Runtime code must not import the spec companion; use @/contracts." },
            { group: ["@/contracts/server", "@/contracts/server/**", "**/contracts/server"], message: "Server-only contracts: import from a route handler or src/server, never UI code." },
          ],
        },
      ],
    },
  },
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
