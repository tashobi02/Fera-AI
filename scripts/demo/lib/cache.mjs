// Cache audit helpers for the Fera offline stack (TASK-053, revised).
//
// The offline stack never downloads model weights. It points the
// runtime at a pre-existing on-disk cache (FERA_MODEL_CACHE, default
// <repo>/.cache/models) and audits the pinned files. The audit
// computes the FULL file sha256 (no `auditCacheLayout` partial hash)
// because the previous lighter variant mixed `require("node:fs")` in
// an ESM module and used a 1 MiB head-only read that was fine for
// layout checks but a lie for security-grade audits.
//
// `auditCache` is the only function the rest of the offline stack
// uses. It always reads the full file via a streaming hash. The
// short-circuit `cacheLayoutExists` is preserved for status output
// but never used as a guard for "is the cache usable?".
import { existsSync, readdirSync, statSync, createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { PINS, EXPECTED_FILES, sha256File } from "./pins.mjs";

export { EXPECTED_FILES, sha256File } from "./pins.mjs";

export function defaultCacheDir(env = process.env) {
  return env.FERA_MODEL_CACHE ?? resolve(process.cwd(), ".cache", "models");
}

function modelSubdir(cacheDir) {
  return join(cacheDir, "Xenova", "multilingual-e5-small");
}

async function pinFile(rootDir, filePath) {
  const full = join(rootDir, filePath);
  if (!existsSync(full)) return { status: "missing", sha256: null, bytes: 0 };
  let st;
  try {
    st = statSync(full);
  } catch {
    return { status: "missing", sha256: null, bytes: 0 };
  }
  if (!st.isFile()) return { status: "missing", sha256: null, bytes: 0 };
  const sha256 = await sha256File(full);
  return { status: "ok", sha256, bytes: st.size };
}

function shortReport(present, missing, tampered) {
  if (present === 0) return "missing";
  if (missing.length > 0) return "partial";
  if (tampered.length > 0) return "tampered";
  return "ok";
}

// `auditCache` is the single authoritative cache check. It walks every
// pinned file, full-streams the sha256, and returns a structured
// report. A future caller can check `audit.status === "ok"` to decide
// whether to start the app.
//
// Optional `pinnedRoot` lets the caller restrict the audit to a
// per-worktree owned sub-directory. When set, the audit refuses to
// proceed if the directory does not exist OR is not owned by the
// current worktree (so a foreign lane's cache cannot satisfy this
// lane's audit).
export async function auditCache(cacheDir = defaultCacheDir(), { pinnedRoot = null } = {}) {
  const modelDir = modelSubdir(cacheDir);
  const used = existsSync(modelDir) ? modelDir : cacheDir;

  if (pinnedRoot) {
    if (!existsSync(pinnedRoot)) {
      return {
        cacheDir,
        layoutDir: used,
        modelId: "Xenova/multilingual-e5-small",
        expected: [],
        present: 0,
        missing: [...EXPECTED_FILES],
        tampered: [],
        status: "missing",
        foreign: true,
        reason: `pinned root ${pinnedRoot} does not exist`,
      };
    }
  }

  const expected = [];
  const missing = [];
  const tampered = [];
  let present = 0;
  for (const f of EXPECTED_FILES) {
    const pin = PINS.model.find((p) => p.path === f);
    if (!pin) continue;
    const r = await pinFile(used, f);
    expected.push({ path: f, sha256: pin.sha256 });
    if (r.status === "missing") {
      missing.push(f);
      continue;
    }
    present += 1;
    if (r.sha256 !== pin.sha256) {
      tampered.push(f);
    }
  }
  return {
    cacheDir,
    layoutDir: used,
    modelId: "Xenova/multilingual-e5-small",
    expected,
    present,
    missing: missing.sort(),
    tampered: tampered.sort(),
    status: shortReport(present, missing, tampered),
  };
}

// `cacheLayoutExists` is a cheap existence-only check. It does NOT
// verify file content. Use `auditCache` for security-grade checks.
export function cacheLayoutExists(cacheDir = defaultCacheDir()) {
  const modelDir = modelSubdir(cacheDir);
  if (!existsSync(modelDir)) return { ok: false, reason: "model subdir missing", dir: cacheDir };
  for (const f of EXPECTED_FILES) {
    if (!existsSync(join(modelDir, f))) return { ok: false, reason: `missing ${f}`, dir: cacheDir };
  }
  return { ok: true, dir: modelDir };
}

export function listCacheContents(cacheDir = defaultCacheDir()) {
  if (!existsSync(cacheDir)) return [];
  const out = [];
  function walk(dir, prefix) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else if (e.isFile()) {
        const st = statSync(full);
        out.push({ path: rel, size: st.size });
      }
    }
  }
  walk(cacheDir, "");
  return out;
}

// Re-export sha256 helpers from pins for the small number of test
// callers that prefer a cache-local import.
export { createHash, createReadStream };
