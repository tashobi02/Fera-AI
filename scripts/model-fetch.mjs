#!/usr/bin/env node
// npm run model:fetch — TASK-016 / COMP-011 / P3-024.
//
// Downloads the four pinned e5-small model files from
// huggingface.co (revision 761b726dd34fb83930e26aab4e9ac3899aa1fa78) into
// a gitignored cache directory (default `.cache/models`, anchored at the
// repository root via `import.meta.url`, or `$FERA_MODEL_CACHE` if set).
//
// SECURITY HARDENING (P3-024):
//   * This is the ONLY entry point that makes network requests to
//     huggingface.co. It fetches fixed public URLs for the pinned assets,
//     checks each SHA-256, then loads the pipeline with remote disabled.
//     The runtime path (the loader and `scripts/reembed.mjs`)
//     keeps remote disabled and refuses to download. The fetch here is
//     opt-in: an operator runs `npm run model:fetch` once to prime the
//     cache, and every subsequent run uses the local files only.
//   * Every downloaded file is checked against its pinned SHA-256 digest
//     (see `MODEL_FILES` in src/server/embeddings/model.ts). A mismatched
//     download (or a tampered cached file replaced by an adversary) is
//     deleted and the script exits non-zero. The pinned digests are the
//     only thing that ties the bytes on disk to the revision; Hugging
//     Face's LFS oids are quoted for the onnx and tokenizer.json files,
//     and the two small JSON files are recorded trust-on-first-use from
//     the 17 Oct 2026 download.
//   * The HTTP request uses a bounded timeout (default 60s per file, plus
//     5 minutes total) and a size cap so the script cannot hang forever
//     on a slow network or be tricked into overwriting the disk.
//   * Failure output: the error message (no URL with a key, no
//     downloaded bytes, no token). The script never logs the connection
//     string or any environment variable.
//
// Behaviour
//   * Preflight: refuses Node < 22.18 because the script loads
//     TypeScript sources via Node's built-in type stripping, which is
//     only available from Node 22.18 / 23.6 / 24+ (engines in
//     package.json still says 22.12, see the embedding-dependency-note
//     open decision).
//   * Refuses to run if the cache directory is not gitignored — a hard
//     guard against accidentally committing a 100-MiB ONNX file.
//   * Skips files whose SHA-256 already matches (idempotent).
//   * After verification, loads the model via the runtime loader
//     (with `allowRemote: false`) and runs a single warm-up text so any
//     dtype / pool / cache mismatch surfaces here, not in the reembed
//     run.
//
// Exit codes:
//   0  already cached OR downloaded successfully AND model warmed
//   1  network / load / timeout / size error
//   2  the cache dir is not gitignored (refused)
//   3  Node is too old for type stripping
//   4  SHA-256 of a downloaded or cached file does not match

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDING, MODEL_FILES, defaultCacheDir } from "../src/server/embeddings/model.ts";

const CACHE_DIR = defaultCacheDir();
const MODEL_DIR = join(CACHE_DIR, EMBEDDING.model);
const PER_FILE_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 5 * 60_000;
const MAX_FILE_BYTES = 1024 * 1024 * 1024; // 1 GiB hard cap per file; well above the onnx (~113 MiB)
const NODE_MIN = [22, 18]; // major.minor — type-stripping is on from 22.18, 23.6, 24+

const GITIGNORE = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".gitignore");
const REQUIRED_GITIGNORE_LINE = ".cache/";

function nodeCanStripTypes(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (major > NODE_MIN[0]) return true;
  if (major < NODE_MIN[0]) return false;
  return minor >= NODE_MIN[1];
}

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

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureCacheDirGitignored() {
  if (!existsSync(GITIGNORE)) {
    process.stderr.write(`model:fetch: .gitignore not found; refusing to download into ${CACHE_DIR}\n`);
    process.exit(2);
  }
  const lines = readFileSync(GITIGNORE, "utf8").split(/\r?\n/);
  const ok = lines.some((l) => {
    const t = l.trim();
    return t === REQUIRED_GITIGNORE_LINE || t === ".cache" || t === "/.cache" || t === "/.cache/" || t === "models/" || t === "models";
  });
  if (!ok) {
    process.stderr.write(
      `model:fetch: ${CACHE_DIR} is not in .gitignore; refusing to download ${EMBEDDING.model} ` +
        `(add the line \`${REQUIRED_GITIGNORE_LINE}\` to .gitignore first)\n`,
    );
    process.exit(2);
  }
}

function ensureNodeVersion() {
  if (nodeCanStripTypes()) return;
  process.stderr.write(
    `model:fetch: needs Node ${NODE_MIN[0]}.${NODE_MIN[1]} or newer (or a higher major with type stripping); this is Node ${process.versions.node}.\n`,
  );
  process.exit(3);
}

async function fetchFile(url, dest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_FILE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`download failed (${res.status} ${res.statusText}) for ${url.split("/").pop()}`);
    }
    const cl = res.headers.get("content-length");
    if (cl !== null && Number(cl) > MAX_FILE_BYTES) {
      throw new Error(`download too large: ${cl} bytes (cap ${MAX_FILE_BYTES})`);
    }
    const chunks = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("response body unavailable");
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error(`download too large (cap ${MAX_FILE_BYTES} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    const tmp = `${dest}.part`;
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}

function writeAtomically(dest, bytes) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, dest);
}

async function downloadOne({ model, revision, file }) {
  const url = `https://huggingface.co/${model}/resolve/${revision}/${file.path}`;
  process.stdout.write(`  fetching ${file.path} ...\n`);
  const buf = await fetchFile(url, join(CACHE_DIR, model, file.path));
  if (sha256(buf) !== file.sha256) {
    throw new Error(`SHA-256 mismatch for ${file.path}; refusing to keep downloaded bytes`);
  }
  writeAtomically(join(CACHE_DIR, model, file.path), buf);
  return buf.byteLength;
}

async function ensureOne(model, revision, file) {
  const dest = join(CACHE_DIR, model, file.path);
  if (existsSync(dest)) {
    const onDisk = readFileSync(dest);
    const got = sha256(onDisk);
    if (got === file.sha256) {
      process.stdout.write(`  ok (cached) ${file.path} (${humanBytes(onDisk.byteLength)})\n`);
      return { status: "cached", bytes: onDisk.byteLength };
    }
    // Cached bytes do not match the pin: refuse them. Refusing and
    // re-downloading risks covering up tampering; we delete the bad
    // bytes and abort so the operator can investigate.
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error(
      `cached ${file.path} does not match its pinned SHA-256 (corrupt or replaced); bad bytes deleted. Re-run \`npm run model:fetch\` to re-fetch, or inspect the cache.`,
    );
  }
  const bytes = await downloadOne({ model, revision, file });
  process.stdout.write(`  ok (downloaded, ${humanBytes(bytes)}) ${file.path}\n`);
  return { status: "downloaded", bytes };
}

async function main() {
  ensureNodeVersion();
  ensureCacheDirGitignored();
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(MODEL_DIR, { recursive: true });

  const started = Date.now();
  const deadline = started + TOTAL_TIMEOUT_MS;

  process.stdout.write(
    `model:fetch: model=${EMBEDDING.model} revision=${EMBEDDING.revision} dtype=${EMBEDDING.dtype} cache=${CACHE_DIR}\n`,
  );

  for (const file of MODEL_FILES) {
    if (Date.now() > deadline) {
      process.stderr.write(`model:fetch: total timeout (${TOTAL_TIMEOUT_MS} ms) exceeded; partial cache left on disk\n`);
      process.exit(1);
    }
    try {
      await ensureOne(EMBEDDING.model, EMBEDDING.revision, file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`model:fetch: ${file.path}: ${msg}\n`);
      process.exit(4);
    }
  }

  // Verify everything once more before the warm-up, so a tampered final
  // file is caught too.
  const { verifyModelCache } = await import("../src/server/embeddings/model.ts");
  try {
    await verifyModelCache(CACHE_DIR);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`model:fetch: ${msg}\n`);
    process.exit(4);
  }

  // Warm up with the runtime loader (allowRemote = false). Any cache or
  // dtype / pool mismatch surfaces here, not in the reembed run.
  const { EMBEDDING_DIM, loadLocalEmbedder } = await import("../src/server/embeddings/model.ts");
  let embedder;
  try {
    embedder = await loadLocalEmbedder({ cacheDir: CACHE_DIR, allowRemote: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`model:fetch: warm-up failed: ${msg}\n`);
    process.exit(1);
  }
  const v = await embedder.embed(["passage: warm-up"]);
  if (v.length !== 1 || v[0].length !== EMBEDDING_DIM) {
    process.stderr.write(`model:fetch: warm-up shape mismatch (got ${v[0]?.length ?? 0}-d)\n`);
    process.exit(1);
  }

  const totalBytes = dirSize(CACHE_DIR);
  const elapsedMs = Date.now() - started;

  process.stdout.write(`model:fetch: cache_total_size=${humanBytes(totalBytes)}\n`);
  process.stdout.write(`model:fetch: elapsed_ms=${elapsedMs}\n`);
  process.stdout.write(`model:fetch: gitignore_line=${REQUIRED_GITIGNORE_LINE}\n`);
  process.stdout.write(`model:fetch: ok\n`);
  process.exit(0);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`model:fetch: ${msg}\n`);
    process.exit(1);
  });
}

// Re-export the helpers so a follow-up worker can run the same warm-up
// in a unit test without copying the cache-rooted logic.
export { CACHE_DIR, MODEL_DIR, MODEL_FILES, EMBEDDING, humanBytes, dirSize, ensureNodeVersion };
