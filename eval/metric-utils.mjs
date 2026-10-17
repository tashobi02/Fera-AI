// eval/metric-utils.mjs — shared helpers for eval:extract, eval:match,
// eval:dedupe and eval:all (D2B §17, TC-020, TASK-039).
//
// Every measured number has a denominator. A missing or unparseable input
// prints "not measured (<reason>)" — never a fabricated zero. Failure
// examples are taken from real input; if none are available we print
// "failures: none available" rather than invent two.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..");
export const DATA_DIR = resolve(REPO_ROOT, "data", "synthetic");
export const MANIFEST_PATH = join(DATA_DIR, "manifest.json");
export const MANIFEST_HASH_PATH = join(DATA_DIR, "manifest.sha256");
export const RECORDS_PATH = join(DATA_DIR, "records.jsonl");
export const GROUND_TRUTH_PATH = join(DATA_DIR, "ground_truth.json");
export const EVAL_DATA_DIR = resolve(REPO_ROOT, "eval", "data");
export const REPORTS_DIR = resolve(REPO_ROOT, "reports");
export const LABELED_DRAFT_PATH = join(EVAL_DATA_DIR, "labelled.draft.jsonl");

/* ---------- not measured helpers ---------- */

export function notMeasuredMessage(prefix, reason) {
  return `${prefix}: not measured (${reason})`;
}

/* ---------- hash helpers ---------- */

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function fileSha256(path) {
  return sha256(readFileSync(path));
}

/* ---------- git commit hash ---------- */

export function gitHeadShort() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function gitHeadFull() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/* ---------- model / manifest freeze checks (AMD-3-3, D2B §17) ---------- */

// ENV CONTRACT (set by freeze owner before held-out runs):
//   FERA_FREEZE_COMMIT     — git SHA that the manifest was frozen at
//   FERA_FREEZE_MODEL      — model name + revision the manifest was frozen for
//   FERA_MANIFEST_SHA256   — manifest hash recorded at freeze time
// Held-out runs (split === "heldout" or "test") refuse to start unless all
// three are present AND match the live state.
export function checkFreezeGate(split) {
  if (split !== "heldout" && split !== "test") return { ok: true, reason: null };
  const exp = {
    commit: process.env.FERA_FREEZE_COMMIT ?? null,
    model: process.env.FERA_FREEZE_MODEL ?? null,
    manifest: process.env.FERA_MANIFEST_SHA256 ?? null,
  };
  const missing = Object.entries(exp).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) {
    return { ok: false, reason: `held-out requires ${missing.join(", ")}` };
  }
  const live = {
    commit: gitHeadFull(),
    manifest: existsSync(MANIFEST_HASH_PATH) ? readFileSync(MANIFEST_HASH_PATH, "utf8").split(/\s+/)[0] : null,
  };
  if (exp.commit && live.commit && exp.commit !== live.commit) {
    return { ok: false, reason: `freeze commit ${exp.commit} != HEAD ${live.commit}` };
  }
  if (exp.manifest && live.manifest && exp.manifest !== live.manifest) {
    return { ok: false, reason: `freeze manifest ${exp.manifest} != live ${live.manifest}` };
  }
  return { ok: true, reason: null, expected: exp, live };
}

/* ---------- JSON / JSONL helpers (no transcript/child text leakage) ---------- */

export function parseJsonl(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      // Never echo the input — only the line number.
      throw new Error(`line ${i + 1}: invalid JSON`);
    }
    out.push(obj);
  }
  return out;
}

export function safeReadJsonl(path) {
  if (!existsSync(path)) return { present: false, rows: [], path };
  const text = readFileSync(path, "utf8");
  return { present: true, rows: parseJsonl(text), path };
}

export function safeReadJson(path) {
  if (!existsSync(path)) return { present: false, value: null, malformed: false, path };
  try {
    return { present: true, value: JSON.parse(readFileSync(path, "utf8")), malformed: false, path };
  } catch {
    return { present: true, value: null, malformed: true, path };
  }
}

/* ---------- small numeric helpers ---------- */

export function pct(num, denom) {
  if (denom === 0) return null;
  return (num / denom) * 100;
}

export function fmtPercent(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v.toFixed(digits)}%`;
}

export function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/* ---------- predicates for fields on a draft ---------- */

export function fieldPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

export function valueEqual(a, b) {
  if (!fieldPresent(a) || !fieldPresent(b)) return false;
  return String(a).trim() === String(b).trim();
}

export function ageIntervalsOverlap(aMin, aMax, bMin, bMax, tol = 2) {
  if ([aMin, aMax, bMin, bMax].some((v) => v === null || v === undefined)) return null;
  if (aMin > aMax || bMin > bMax) return false;
  const lo = Math.max(aMin, bMin - tol);
  const hi = Math.min(aMax, bMax + tol);
  return lo <= hi;
}

/* ---------- failure sampling (NEVER invent failures) ---------- */

export function sampleFailures(rows, predicate, max = 5) {
  const out = [];
  for (const row of rows) {
    if (predicate(row)) {
      out.push(row.id ?? row.record_id ?? null);
      if (out.length >= max) break;
    }
  }
  return out;
}

/* ---------- manifest lib presence check ---------- */

export function hasManifestLib() {
  return existsSync(join(REPO_ROOT, "eval", "manifest-lib.mjs"));
}

export function getManifestLib() {
  if (!hasManifestLib()) return null;
  try {
    const require = createRequire(import.meta.url);
    return require(pathToFileURL(join(REPO_ROOT, "eval", "manifest-lib.mjs")).href);
  } catch {
    return null;
  }
}

/* ---------- CLI helpers (shared) ---------- */

export function parseCommonArgs(argv, usage) {
  const out = { split: "dev", prediction: null, input: null, help: false, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--split") out.split = argv[++i];
    else if (arg === "--prediction") out.prediction = argv[++i];
    else if (arg === "--input") out.input = argv[++i];
    else if (arg === "--heldout") out.split = "heldout";
    else if (arg === "--dev") out.split = "dev";
    else out.errors.push(`unknown argument: ${arg}`);
  }
  if (!["dev", "heldout", "test"].includes(out.split)) {
    out.errors.push(`split must be dev|heldout|test, got ${out.split}`);
  }
  if (out.errors.length && !out.help) {
    process.stderr.write(`eval: ${out.errors.join("; ")}\nusage: ${usage}\n`);
    process.exit(2);
  }
  return out;
}

export function loadManifest() {
  const m = safeReadJson(MANIFEST_PATH);
  if (!m.present || m.malformed || !m.value) return null;
  return m.value;
}

export function loadSplitRecords(split) {
  // Reads manifest and returns record ids assigned to the requested split.
  const manifest = loadManifest();
  if (!manifest) return null;
  if (split === "test") split = "heldout";
  if (!manifest.splits || !manifest.splits[split]) return null;
  return {
    split,
    recordIds: new Set(manifest.splits[split].record_ids),
    groupIds: new Set(manifest.splits[split].group_ids),
    counts: manifest.counts?.by_split?.[split] ?? null,
  };
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
