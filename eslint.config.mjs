import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Route and page code reaches the case service only through its barrel (TASK-015):
// @/server/case/internal and the deep modules (state, lock, tx, candidates…) take an
// AuditActor rather than a Principal and are for src/server (matcher, tests) only.
const CASE_INTERNALS = {
  group: ["@/server/case/*", "**/server/case/*", "!@/server/case/index"],
  message: "Import the case service from @/server/case; its internals are for src/server only.",
};

function contractPatterns({ server, app = false }) {
  const patterns = [
    {
      group: ["@/contracts/examples", "**/contracts/examples", "@/contracts/client-examples", "**/contracts/client-examples", "@/contracts/client-examples.json", "**/contracts/client-examples.json"],
      message: "Typed fakes are for tests/ and fakes/ only.",
    },
    { group: ["**/docs/code/**"], message: "Runtime code must not import the spec companion; use @/contracts." },
  ];
  if (server) {
    patterns.push({
      group: ["@/contracts/server", "@/contracts/server/**", "**/contracts/server", "**/contracts/server/**"],
      message: "Server-only contracts: import from a route handler or src/server, never UI code. Use @/contracts/access for permission helpers.",
    });
  }
  if (app) patterns.push(CASE_INTERNALS);
  return patterns;
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Contracts boundaries (TASK-061). Flat config does not merge rule options, so the
  // client block repeats the base patterns and the same fakes/tests ignores.
  //  - Typed fakes (examples, client-examples) only in tests/ and fakes/.
  //  - The fera_types_v2.ts companion never in src/.
  //  - Server contracts never in client paths. Files marked "use client" elsewhere are
  //    not expressible here; the `server-only` package is the real fix (OD-4).
  //    Pure permission helpers for UI live in the client-safe @/contracts/access.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/fakes/**", "src/**/*.test.{ts,tsx}", "src/contracts/examples.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: contractPatterns({ server: false }) }],
    },
  },
  {
    files: ["src/app/**/*.ts"],
    ignores: ["src/**/fakes/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: contractPatterns({ server: false, app: true }) }],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx", "src/hooks/**/*.{ts,tsx}", "src/lib/**/*.client.{ts,tsx}"],
    ignores: ["src/**/fakes/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: contractPatterns({ server: true, app: true }) }],
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
