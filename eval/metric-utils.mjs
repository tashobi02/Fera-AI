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
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { paths as manifestPaths, loadSplit as loadCanonicalSplit } from "./manifest-lib.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..");
export const DATA_DIR = resolve(REPO_ROOT, "data", "synthetic");
export const MANIFEST_PATH = manifestPaths.manifest;
export const MANIFEST_HASH_PATH = manifestPaths.hash;
export const RECORDS_PATH = manifestPaths.records;
export const GROUND_TRUTH_PATH = manifestPaths.groundTruth;
export const FREEZE_PATH = manifestPaths.freeze;
export const EVAL_DATA_DIR = resolve(REPO_ROOT, "eval", "data");
export const REPORTS_DIR = resolve(REPO_ROOT, "eval", "reports");
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

// The canonical manifest loader validates the committed hash, source data,
// group assignment, and FREEZE.md flag. Environment variables cannot unlock
// the test split or override an invalid manifest.
export function checkFreezeGate(split) {
  const canonicalSplit = canonicalSplitName(split);
  const manifest = loadManifest();
  if (!manifest) throw new Error(`manifest: canonical manifest is missing: ${MANIFEST_PATH}`);

  try {
    loadCanonicalSplit(manifest, canonicalSplit);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (canonicalSplit === "test" && reason.includes("freeze flag is not set in eval/FREEZE.md")) {
      return { ok: false, reason };
    }
    throw error;
  }
  return { ok: true, reason: null, split: canonicalSplit };
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
  if (!m.present) return null;
  if (m.malformed || !m.value || typeof m.value !== "object") {
    throw new Error(`manifest: invalid JSON in ${MANIFEST_PATH}`);
  }
  return m.value;
}

function canonicalSplitName(split) {
  if (split === "dev") return "dev";
  if (split === "heldout" || split === "test") return "test";
  throw new Error(`manifest: unknown split ${split}`);
}

export function loadSplitRecords(split) {
  // Validates the canonical manifest and returns IDs from its committed
  // dev/test assignment. `heldout` remains a CLI alias for canonical `test`.
  const manifest = loadManifest();
  if (!manifest) throw new Error(`manifest: canonical manifest is missing: ${MANIFEST_PATH}`);
  const selectedSplit = canonicalSplitName(split);
  const rows = loadCanonicalSplit(manifest, selectedSplit);
  return {
    split: selectedSplit,
    recordIds: new Set(rows.map((row) => row.record_id)),
    groupIds: new Set(rows.map((row) => row.split_group_id)),
    counts: manifest.counts?.by_split?.[selectedSplit] ?? null,
  };
}

export function splitInfoFromManifest(manifest, split) {
  const selectedSplit = canonicalSplitName(split);
  if (!Array.isArray(manifest?.records)) return null;
  const rows = manifest.records.filter((row) => row.split === selectedSplit);
  return {
    split: selectedSplit,
    record_ids: rows.map((row) => row.record_id),
    group_ids: [...new Set(rows.map((row) => row.split_group_id))],
  };
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
