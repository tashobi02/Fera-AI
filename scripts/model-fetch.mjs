#!/usr/bin/env node
// npm run model:fetch — P3-024 / TASK-016 / COMP-011.
//
// Downloads the multilingual-e5-small Transformers.js model into a
// gitignored cache directory (`.cache/models`, already in `.gitignore`) so
// the reembed script can run offline later. The script is the smallest
// thing that does the work: it does NOT touch the database and does NOT
// read .env* files.
//
// SECURITY HARDENING (P3-024, this lane):
//   * The runtime loader (src/server/embeddings/model.ts) refuses remote
//     downloads by default (`env.allowRemoteModels = false`). This script
//     is the ONLY entry point that enables remote fetching, via the
//     explicit `allowRemote: true` option. Without the option the call
//     would be allowed to fail and the operator would have to set
//     `FERA_EMBED_ALLOW_REMOTE=1` as a separate, auditable step.
//   * The cache directory is resolved from the repository root via
//     `import.meta.url`, so this script and `scripts/reembed.mjs` and the
//     loader all agree on the same `.cache/models` path regardless of
//     the cwd.
//
// Behaviour
//   * Refuses to run if the cache directory is not gitignored — a hard
//     guard against accidentally committing a 100-MiB ONNX file.
//   * Sets `@huggingface/transformers` cache to the gitignored path before
//     loading the pipeline (the first call downloads the weights).
//   * Calls the pipeline once with a warm-up text so the download is
//     triggered and any dtype / pool mismatch surfaces here, not in the
//     reembed run.
//   * Prints the resolved cache path, the weight file size, and the total
//     directory size, in human-friendly units, on stdout. The .gitignore
//     line is also printed once so the operator can verify it.
//
// Exit codes:
//   0  model already cached OR downloaded successfully
//   1  network / load error
//   2  the cache dir is not gitignored (refused)

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "Xenova/multilingual-e5-small";
// Resolve the cache dir from the repository root (this file lives at
// scripts/model-fetch.mjs, so two `..` get us to the repo root), and then
// join with the gitignored .cache/models. The same path is used by
// scripts/reembed.mjs and src/server/embeddings/model.ts so all three
// agree when run from any directory.
const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "models");
const DTYPE = "fp32";
const ONNX_NAME = DTYPE === "fp32" ? "model.onnx" : DTYPE === "q8" ? "model_quantized.onnx" : `model_${DTYPE}.onnx`;

const GITIGNORE = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".gitignore");
const REQUIRED_GITIGNORE_LINE = ".cache/";

function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1048576).toFixed(1)} MiB`;
}

function ensureCacheDirGitignored() {
  if (!existsSync(GITIGNORE)) {
    process.stderr.write(`model:fetch: .gitignore not found; refusing to download into ${CACHE_DIR}\n`);
    process.exit(2);
  }
  const lines = readFileSync(GITIGNORE, "utf8").split(/\r?\n/);
  // Match a line whose trimmed content equals ".cache/" or ".cache" (the
  // trailing slash is fine; both ignore the directory).
  const ok = lines.some((l) => {
    const t = l.trim();
    return t === REQUIRED_GITIGNORE_LINE || t === ".cache" || t === "/.cache" || t === "/.cache/";
  });
  if (!ok) {
    process.stderr.write(
      `model:fetch: ${CACHE_DIR} is not in .gitignore; refusing to download ${MODEL} ` +
        `(add the line \`${REQUIRED_GITIGNORE_LINE}\` to .gitignore first)\n`,
    );
    process.exit(2);
  }
}

async function main() {
  ensureCacheDirGitignored();
  mkdirSync(CACHE_DIR, { recursive: true });

  // The dynamic import means the (heavy) transformers library is only
  // loaded when the script actually runs, so a syntax check of the file
  // never triggers a download.
  const { env, pipeline } = await import("@huggingface/transformers");
  // SECURITY HARDENING: this script is the one place that is allowed to
  // turn remote downloads on. Every other code path (the loader and
  // reembed.mjs) keeps `env.allowRemoteModels = false`. The setting is
  // local to this script's process; nothing else inherits it.
  env.allowRemoteModels = true;
  env.cacheDir = CACHE_DIR;

  const t0 = Date.now();
  let extractor;
  try {
    extractor = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`model:fetch: download failed${code}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  // Warm-up so the weights file is materialised on disk and any dtype / pool
  // mismatch surfaces here, not in the reembed run.
  try {
    await extractor("passage: warm-up", { pooling: "mean", normalize: true });
  } catch (err) {
    process.stderr.write(`model:fetch: warm-up failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const onnxPath = join(CACHE_DIR, MODEL, "onnx", ONNX_NAME);
  const weightBytes = existsSync(onnxPath) ? statSync(onnxPath).size : 0;
  const totalBytes = dirSize(CACHE_DIR);
  const elapsedMs = Date.now() - t0;

  process.stdout.write(`model:fetch: model=${MODEL} dtype=${DTYPE}\n`);
  process.stdout.write(`model:fetch: cache_path=${CACHE_DIR}\n`);
  process.stdout.write(`model:fetch: weight_file=${onnxPath} (${ONNX_NAME}) size=${humanBytes(weightBytes)}\n`);
  process.stdout.write(`model:fetch: cache_total_size=${humanBytes(totalBytes)}\n`);
  process.stdout.write(`model:fetch: elapsed_ms=${elapsedMs}\n`);
  process.stdout.write(`model:fetch: gitignore_line=${REQUIRED_GITIGNORE_LINE}\n`);
  process.exit(0);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main().catch((err) => {
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`model:fetch: unhandled error${code}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

// Re-export the helpers so a follow-up worker can run the same warm-up in
// a unit test without copying the cache-rooted logic.
export { MODEL, DTYPE, ONNX_NAME, CACHE_DIR, humanBytes, dirSize };
