// vitest.predict-dev.config.mts — Fera Phase 3 dev-split prediction generator.
//
// This is a SEPARATE vitest config used ONLY by the standalone predict-dev
// runner. It is not loaded by `npm test` (which uses vitest.config.mts).
// It resolves the project's `@/` TypeScript aliases so the runner can
// import the real matcher + duplicate detector + embedder from
// src/server/* without an extra dependency.
//
// Invocation:
//   npx vitest run --config vitest.predict-dev.config.mts \
//     scripts/eval/predict-dev.runner.test.ts
//
// The runner test reads the env vars FERA_PREDICT_MATCH_OUT and
// FERA_PREDICT_DEDUPE_OUT to choose output paths, and FERA_PREDICT_DB
// for the isolated database name (default: fera_predict_dev).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Only the standalone runner is included here. `npm test` (which uses
    // vitest.config.mts) does not include this path; tests/predict-dev
    // unit tests live under tests/scripts/predict-dev.test.ts and are run
    // by the regular test pipeline.
    include: ["scripts/eval/predict-dev.runner.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".worktrees/**"],
    // A single-file run; no parallelism across the runner (the generator
    // holds a single connection pool).
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 60 * 60 * 1000, // up to 1h: the local E5 model + 200 embeddings
    hookTimeout: 60 * 60 * 1000,
  },
});