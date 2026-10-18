// Pinned asset table for the Fera offline stack (TASK-053).
//
// Every SHA-256 here is the digest of the file that MUST be on disk
// before the offline stack declares itself ready. The audit script
// compares this list with what's actually in the cache and refuses to
// start if a file is missing or tampered.
//
// Sources of the digests:
//   * MODEL pins — copied verbatim from src/server/embeddings/model.ts
//     (`MODEL_FILES`). They are the same digests the runtime
//     `verifyModelCache` calls; if model.ts changes, this file MUST
//     change in the same commit. The runtime never imports this one
//     (the offline audit happens before the runtime is started).
//   * Font pins — sha256 of each *.woff2 in src/app/fonts/. The
//     offline stack serves the same bytes the regular `next start`
//     uses, so the UI is byte-identical online and offline.
//   * District assets — sha256 of data/districts.json (TASK-009) and
//     the synthetic case manifest (ground_truth + records). Same
//     reason: the offline stack must use the same fixtures the
//     regular seed path uses.
//   * Schema/role pins — sha256 of db/schema_v2.sql and db/roles.sql
//     so a fresh schema load is reproducible across offline runs.
//   * DB script entries — the helpers the offline stack shells out to
//     (db:reset, seed, model fetch, reembed). These carry an EMPTY
//     sha256 on purpose: no digest is recorded for them, so `verify`
//     only checks that each file is present and readable (and reports
//     its current hash). They are NOT drift-checked, and
//     `expectedPin` / `allPinnedFiles` skip them.
//
// No automated test currently cross-checks the model pins against
// MODEL_FILES in model.ts; keep the two in sync by hand.

export const PINS = Object.freeze({
  model: Object.freeze([
    Object.freeze({ path: "config.json", sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1" }),
    Object.freeze({ path: "tokenizer_config.json", sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" }),
    Object.freeze({ path: "tokenizer.json", sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" }),
    Object.freeze({ path: "onnx/model_quantized.onnx", sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193" }),
  ]),
  fonts: Object.freeze([
    Object.freeze({ path: "fonts/inter-latin-wght.woff2", sha256: "d2f59ae33efdce6ae6b7687dd3af7a48d7451f160ab99a764931a60eabc49945" }),
    Object.freeze({ path: "fonts/jetbrains-mono-latin-wght.woff2", sha256: "18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e" }),
    Object.freeze({ path: "fonts/noto-sans-bengali-bengali-wght.woff2", sha256: "4ccdc6269af7581727fc3eea491831bda1962c1baaca7f2c0dec054bfddde478" }),
  ]),
  districtAssets: Object.freeze([
    Object.freeze({ path: "data/districts.json", sha256: "81b05324a5630e8ec844de0a5e0e5b6a781c235f5ff5b8d77edc4081977df455" }),
  ]),
  dbScripts: Object.freeze([
    Object.freeze({ path: "db/schema_v2.sql", sha256: "08e7ad04ad093366787eeb9e8785e67c4558b1cf770f65806d1ad8df86042d87" }),
    Object.freeze({ path: "db/roles.sql", sha256: "b0422908d5e646c976ba5f70280aadb103d18817b97b5b321f18d5cd2d574596" }),
    Object.freeze({ path: "scripts/db/reset.mjs", sha256: "" }),
    Object.freeze({ path: "scripts/db/seed-users.mjs", sha256: "" }),
    Object.freeze({ path: "db/seed/index.mjs", sha256: "" }),
    Object.freeze({ path: "scripts/model-fetch.mjs", sha256: "" }),
    Object.freeze({ path: "scripts/reembed.mjs", sha256: "" }),
  ]),
});

// `EXPECTED_FILES` is the sorted list of model files the cache audit
// requires. It is derived at module load so tests can use it without
// touching the filesystem.

export const EXPECTED_FILES = Object.freeze(
  [...PINS.model.map((p) => p.path)].sort(),
);

export function expectedPin(relativePath) {
  for (const group of [PINS.model, PINS.fonts, PINS.districtAssets, PINS.dbScripts]) {
    const hit = group.find((p) => p.path === relativePath);
    if (hit && hit.sha256) return hit;
  }
  return undefined;
}

export function allPinnedFiles() {
  const out = [];
  for (const group of [PINS.model, PINS.fonts, PINS.districtAssets, PINS.dbScripts]) {
    for (const p of group) if (p.sha256) out.push(p);
  }
  return out;
}

// Read the SHA-256 of a file using a streaming hash so very large
// pinned model files do not load fully into memory. Rejects on any
// read error, including ENOENT: a missing file must never hash as the
// digest of empty input. Callers check presence first.
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

export async function sha256File(filePath) {
  const h = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => h.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return h.digest("hex");
}

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function modelPinMap() {
  const out = new Map();
  for (const p of PINS.model) out.set(p.path, p.sha256);
  return out;
}