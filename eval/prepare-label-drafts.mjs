#!/usr/bin/env node
// eval:prepare-label-drafts — deterministically prepare up to 50 unlabelled
// canonical draft rows from the DEV split for human review.
//
// Context: eval/data/labelled.draft.jsonl carries hand-picked Bangla inputs
// keyed L001..L050 that do not map to canonical manifest record_ids, which
// blocks eval/extract.mjs (D2B §17, AMD-3-3: label IDs must be canonical).
// This script produces a NEW draft — eval/data/labelled.canonical.draft.jsonl
// — whose ids are real canonical record_ids from data/synthetic/records.jsonl
// restricted to the dev split, with text === draft.source_text verbatim, and
// labels === {} on every row.
//
// Why dev-only:
//   - FREEZE_FLAG is NOT SET (eval/FREEZE.md). Held-out test-split records
//     are explicitly held out by loadSplit() and may not be inspected or
//     surfaced to a human labeller before freeze.
//   - Per the freeze policy, the script must not select held-out records
//     for label preparation; doing so would leak test data into
//     labelled.canonical.draft.jsonl before freeze.
//
// The script is intentionally dumb:
//   - read eval/manifest.json's records, keep only split === "dev"
//   - sort those dev record_ids lexicographically
//   - for each id, look up draft.source_text in data/synthetic/records.jsonl
//   - take the first 50 that have non-empty source_text
//   - never peek at role / partner / no_match / decoy_type / predictions
//   - never tune thresholds, never call a model, never load test split
//   - refuses to overwrite labelled.draft.jsonl (historical L001..L050)
//   - refuses to overwrite labelled.jsonl (human-review pending file)
//   - refuses to write outside eval/data/ unless --out points inside it
//   - refuses to overwrite labelled.canonical.draft.jsonl unless --replace
//     is passed AND every existing row's labels are empty
//
// Usage:
//   node eval/prepare-label-drafts.mjs
//   node eval/prepare-label-drafts.mjs --out eval/data/labelled.canonical.draft.jsonl
//   node eval/prepare-label-drafts.mjs --replace
//   node eval/prepare-label-drafts.mjs --count 30
//
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..");
const RECORDS_PATH = join(REPO_ROOT, "data", "synthetic", "records.jsonl");
const MANIFEST_PATH = join(REPO_ROOT, "eval", "manifest.json");
const EVAL_DATA_DIR = join(REPO_ROOT, "eval", "data");
const HISTORICAL_DRAFT_PATH = join(EVAL_DATA_DIR, "labelled.draft.jsonl");
const LABELED_PENDING_PATH = join(EVAL_DATA_DIR, "labelled.jsonl");
const DEFAULT_OUT = join(EVAL_DATA_DIR, "labelled.canonical.draft.jsonl");
export const DEFAULT_COUNT = 50;
export const MAX_COUNT = 50;
export const TARGET_SPLIT = "dev";
/** Filenames inside eval/data/ that this script will never overwrite. */
export const PROTECTED_FILENAMES = new Set([
  "labelled.draft.jsonl",
  "labelled.jsonl",
]);

/** Read the records.jsonl stream as an array of objects. We keep the parser
 *  local and explicit so this script never depends on metric-utils (which
 *  can refuse to read certain files) or any model. */
export async function readRecords(path) {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    lines.push(JSON.parse(line));
  }
  return lines;
}

/** Pure helper exported for tests. Given a list of `records` and a
 *  `manifestIds` set (already filtered to dev only), selects the first
 *  `count` records (sorted by record_id) whose record_id is in
 *  `manifestIds` and whose `draft.source_text` is non-empty. Returns rows
 *  shaped {id, text, labels} with labels always empty. */
export function buildLabelDrafts(records, manifestIds, count = DEFAULT_COUNT) {
  if (!Array.isArray(records)) throw new Error("prepare-label-drafts: records must be an array");
  if (!(manifestIds instanceof Set)) throw new Error("prepare-label-drafts: manifestIds must be a Set");
  if (!Number.isInteger(count) || count < 1) throw new Error("prepare-label-drafts: count must be a positive integer");

  const seen = new Set();
  const selected = [];
  // Deterministic: copy + sort by record_id, never by ground truth role.
  const sorted = [...records].sort((a, b) => {
    const left = String(a?.record_id ?? "");
    const right = String(b?.record_id ?? "");
    return left.localeCompare(right);
  });
  for (const record of sorted) {
    const id = record?.record_id;
    if (typeof id !== "string" || id.length === 0) continue;
    if (!manifestIds.has(id)) continue;
    if (seen.has(id)) continue;
    const sourceText = record?.draft?.source_text;
    if (typeof sourceText !== "string" || sourceText.length === 0) continue;
    seen.add(id);
    selected.push({ id, text: sourceText, labels: {} });
    if (selected.length === count) break;
  }
  return selected;
}

/** Validate that every id in the proposed output is in the manifest set and
 *  the source text is non-empty. Returns the list of issues (empty = ok). */
export function validateDraftRows(rows, manifestIds) {
  const issues = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      issues.push(`row is not an object: ${JSON.stringify(row)}`);
      continue;
    }
    if (!manifestIds.has(row.id)) issues.push(`id ${row.id} is not in the canonical manifest`);
    if (typeof row.text !== "string" || row.text.length === 0) issues.push(`id ${row.id} has empty text`);
    if (!row.labels || Object.keys(row.labels).length !== 0) issues.push(`id ${row.id} has non-empty labels (must be blank)`);
  }
  return issues;
}

/** Build the dev-only set of record_ids from the canonical manifest. Throws
 *  if any record is missing a split value. */
export function loadDevRecordIds(manifestJson) {
  if (!manifestJson || !Array.isArray(manifestJson.records)) {
    throw new Error("prepare-label-drafts: manifest has no records array");
  }
  const ids = new Set();
  for (const row of manifestJson.records) {
    if (row?.split !== TARGET_SPLIT) continue;
    if (typeof row?.record_id === "string" && row.record_id.length > 0) {
      ids.add(row.record_id);
    }
  }
  if (ids.size === 0) {
    throw new Error(`prepare-label-drafts: 0 manifest records have split="${TARGET_SPLIT}"`);
  }
  return ids;
}

/** Read an existing JSONL file; return rows. Throws on parse error. */
export function readJsonl(path) {
  const text = readFileSync(path, "utf8");
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

/** Refuse to overwrite the historical L001..L050 draft or the human-review
 *  pending labelled.jsonl under any flag. */
export function guardProtectedFiles(targetPath) {
  const normalised = resolve(targetPath);
  if (normalised === resolve(HISTORICAL_DRAFT_PATH)) {
    throw new Error(
      `prepare-label-drafts: refusing to write to ${HISTORICAL_DRAFT_PATH} (historical L001..L050 draft is preserved as-is).`,
    );
  }
  if (normalised === resolve(LABELED_PENDING_PATH)) {
    throw new Error(
      `prepare-label-drafts: refusing to write to ${LABELED_PENDING_PATH} (human-review pending file; never overwritten by this script).`,
    );
  }
}

/** Restrict output to within eval/data/ unless explicitly allowed. The
 *  path comparison is resolved + platform-separator aware so this works on
 *  both POSIX and Windows. */
export function guardSafeOutputPath(targetPath) {
  const normalised = resolve(targetPath);
  const safeDir = resolve(EVAL_DATA_DIR) + sep;
  if (!normalised.startsWith(safeDir)) {
    throw new Error(
      `prepare-label-drafts: refusing to write outside ${EVAL_DATA_DIR}: ${normalised}`,
    );
  }
  const basename = normalised.split(sep).pop();
  if (PROTECTED_FILENAMES.has(basename)) {
    // guardProtectedFiles already covers the absolute paths, but this
    // catches e.g. a nested copy of a protected filename.
    guardProtectedFiles(normalised);
  }
}

/** Decide whether we may overwrite the existing target file. */
export function checkOverwriteGuard(targetPath, replace) {
  if (!existsSync(targetPath)) return;
  const rows = readJsonl(targetPath);
  const allEmpty = rows.every((r) => r && (!r.labels || Object.keys(r.labels).length === 0));
  if (!replace) {
    throw new Error(
      `prepare-label-drafts: ${targetPath} already exists; pass --replace to overwrite (and only when every row has empty labels).`,
    );
  }
  if (!allEmpty) {
    throw new Error(
      `prepare-label-drafts: refusing --replace: ${targetPath} contains rows with non-empty labels.`,
    );
  }
}

function parseArgs(argv) {
  const out = { out: DEFAULT_OUT, replace: false, count: DEFAULT_COUNT, help: false, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--replace") out.replace = true;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--count") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) out.errors.push(`--count must be a positive integer, got ${argv[i]}`);
      else out.count = n;
    } else out.errors.push(`unknown argument: ${a}`);
  }
  return out;
}

function helpText() {
  return [
    "node eval/prepare-label-drafts.mjs — prepare unlabelled canonical draft rows",
    "",
    "Options:",
    `  --out <path>   output path (default ${DEFAULT_OUT})`,
    `  --count <N>    how many rows to prepare (default ${DEFAULT_COUNT}, capped at ${MAX_COUNT})`,
    "  --replace      overwrite existing output only when every existing row",
    "                 has empty labels (refuses to overwrite labelled.draft.jsonl",
    "                 or labelled.jsonl under any flag)",
    "  --help         show this help",
    "",
    `Selection rule: from the canonical manifest, take only records with`,
    `split="${TARGET_SPLIT}", sort by record_id, take the first N whose`,
    "draft.source_text is non-empty. Text is draft.source_text verbatim.",
    "Labels are always {}. Never uses role / partner / no_match / split /",
    "predictions, and never writes outside eval/data/.",
  ].join("\n");
}

export async function runPrepareLabelDrafts(options = {}) {
  const {
    out = DEFAULT_OUT,
    replace = false,
    count = DEFAULT_COUNT,
    recordsPath = RECORDS_PATH,
    manifestPath = MANIFEST_PATH,
  } = options;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`prepare-label-drafts: count must be a positive integer, got ${count}`);
  }
  const cappedCount = Math.min(count, MAX_COUNT);

  const target = resolve(out);
  guardProtectedFiles(target);
  guardSafeOutputPath(target);
  checkOverwriteGuard(target, replace);

  const manifestBytes = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestBytes);
  const manifestIds = loadDevRecordIds(manifest);
  const records = await readRecords(recordsPath);
  const rows = buildLabelDrafts(records, manifestIds, cappedCount);
  if (rows.length === 0) {
    throw new Error(
      `prepare-label-drafts: 0 records selected; check ${recordsPath} and ${manifestPath}`,
    );
  }
  const issues = validateDraftRows(rows, manifestIds);
  if (issues.length) {
    throw new Error(`prepare-label-drafts: validation failed: ${issues.join("; ")}`);
  }

  const serialised = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(target, serialised, "utf8");
  return { path: target, count: rows.length, selectedIds: rows.map((r) => r.id) };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText() + "\n");
    return;
  }
  if (args.errors.length) {
    process.stderr.write(`eval:prepare-label-drafts: ${args.errors.join("; ")}\n`);
    process.exit(2);
  }
  const result = await runPrepareLabelDrafts({
    out: args.out,
    replace: args.replace,
    count: args.count,
  });
  process.stdout.write(
    `eval:prepare-label-drafts: wrote ${result.count} unlabelled draft rows to ${result.path}\n`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`eval:prepare-label-drafts: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
