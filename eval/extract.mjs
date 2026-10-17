#!/usr/bin/env node
// eval:extract — P3-210 / TC-020 / TASK-039 GOAL-002.
//
// D2B §17: extraction labels are human-only. We read eval/data/labelled.jsonl
// (or labelled.draft.jsonl) as the *human-empty* label file and an explicit
// --prediction file that maps id -> draft. We compute present-field accuracy,
// false additions (predicted but not labelled) and false omissions (labelled
// but not predicted), per-field precision/recall, and null agreement.
//
// We never call a model. If --prediction is absent, "not measured" is printed
// honestly. Fixture / cache hits and the held-out split are excluded unless
// the freeze gate is satisfied (D2B §17, TC-056, AMD-3-3).
import {
  REPO_ROOT, EVAL_DATA_DIR, checkFreezeGate, fileSha256,
  safeReadJsonl, safeReadJson, fieldPresent, valueEqual, sampleFailures,
  pct, fmtPercent, round2, notMeasuredMessage, gitHeadShort,
  loadManifest, loadSplitRecords,
} from "./metric-utils.mjs";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: node eval/extract.mjs [--split dev|heldout] [--prediction <file>] [--input <file>] [--heldout]";

// Field set D2B §17 names for extraction evaluation.
const FIELDS = [
  "kind",
  "child.name", "child.sex", "child.age_years", "child.age_min", "child.age_max",
  "child.height_cm", "child.clothing", "child.marks",
  "event.at", "event.at_lower", "event.at_upper", "event.at_approx",
  "event.thana", "event.place_text", "event.district_text", "event.district_code",
  "event.circumstances",
  "reporter.relation", "reporter.phone",
];

function getField(obj, dotted) {
  if (!obj) return null;
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

function parseArgs(argv) {
  const out = { split: "dev", prediction: null, input: null, help: false, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--split") out.split = argv[++i];
    else if (a === "--prediction") out.prediction = argv[++i];
    else if (a === "--input") out.input = argv[++i];
    else if (a === "--heldout") out.split = "heldout";
    else if (a === "--dev") out.split = "dev";
    else out.errors.push(`unknown argument: ${a}`);
  }
  if (!["dev", "heldout", "test"].includes(out.split)) {
    out.errors.push(`split must be dev|heldout|test, got ${out.split}`);
  }
  if (out.errors.length && !out.help) {
    process.stderr.write(`eval:extract: ${out.errors.join("; ")}\n${USAGE}\n`);
    process.exit(2);
  }
  return out;
}

function helpText() {
  return [
    "node eval/extract.mjs — Extraction evaluation (D2B §17, GOAL-002, TC-020).",
    "",
    "Reads human-labelled input texts and an explicit prediction file;",
    "computes present-field accuracy, false additions, false omissions,",
    "per-field precision/recall, and null agreement.",
    "",
    "Options:",
    "  --split dev|heldout   which split to evaluate (default dev)",
    "  --input <file>        labelled file (default eval/data/labelled.jsonl",
    "                        or eval/data/labelled.draft.jsonl)",
    "  --prediction <file>   JSONL {id, draft} predictions (REQUIRED for",
    "                        measured output; absent -> not measured)",
    "  --heldout             shortcut for --split heldout",
    "  --dev                 shortcut for --split dev",
    "  --help                this help",
    "",
    "Held-out runs (TC-020 / AMD-3-3) require FERA_FREEZE_COMMIT,",
    "FERA_FREEZE_MODEL and FERA_MANIFEST_SHA256 to match the live tree.",
    "Exits 0 on success and on missing inputs (prints 'not measured').",
  ].join("\n");
}

function hasAnyLabel(rows) {
  return rows.some((r) => r.labels && Object.keys(r.labels).length > 0);
}

function detectCacheHit(prediction) {
  if (prediction && prediction.fixture_id) return true;
  if (prediction && prediction.cache_hit === true) return true;
  if (prediction && prediction.source === "fixture") return true;
  if (prediction && prediction.source === "cache") return true;
  return false;
}

export function scoreRecord(label, prediction) {
  // returns { perField: { path: { present_labelled, present_predicted, correct, false_add, false_omission, value_match } }, nullAgreement: { both_null, one_null, both_present } }
  const perField = {};
  let bothNull = 0, oneNull = 0, bothPresent = 0;
  for (const f of FIELDS) {
    const labVal = getField(label, f);
    const predVal = getField(prediction, f);
    const labPresent = fieldPresent(labVal);
    const predPresent = fieldPresent(predVal);
    let correct = false;
    let falseAdd = false;
    let falseOm = false;
    let valueMatch = null;
    if (labPresent && predPresent) {
      bothPresent++;
      valueMatch = valueEqual(labVal, predVal);
      correct = valueMatch;
    } else if (labPresent && !predPresent) {
      bothNull++;
      falseOm = true;
    } else if (!labPresent && predPresent) {
      oneNull++;
      falseAdd = true;
    } else {
      // both null
      bothNull++;
    }
    perField[f] = {
      present_labelled: labPresent,
      present_predicted: predPresent,
      correct,
      false_add: falseAdd,
      false_omission: falseOm,
      value_match: valueMatch,
    };
  }
  return { perField, nullAgreement: { bothNull, oneNull, bothPresent } };
}

export function aggregateScores(perRecord) {
  const agg = {};
  for (const f of FIELDS) {
    agg[f] = { tp: 0, fp: 0, fn: 0, tn: 0 };
  }
  let totalBothNull = 0, totalOneNull = 0, totalBothPresent = 0;
  let correctCount = 0, totalFieldsMeasured = 0;
  for (const r of perRecord) {
    for (const f of FIELDS) {
      const p = r.perField[f];
      if (p.present_labelled && p.present_predicted) {
        if (p.value_match) agg[f].tp += 1;
        else agg[f].fn += 1; // labelled present but wrong
      } else if (!p.present_labelled && p.present_predicted) {
        agg[f].fp += 1;
      } else if (p.present_labelled && !p.present_predicted) {
        agg[f].fn += 1;
      } else {
        agg[f].tn += 1;
      }
      if (p.value_match) correctCount += 1;
      if (p.present_labelled || p.present_predicted) totalFieldsMeasured += 1;
    }
    totalBothNull += r.nullAgreement.bothNull;
    totalOneNull += r.nullAgreement.oneNull;
    totalBothPresent += r.nullAgreement.bothPresent;
  }
  const metrics = {};
  for (const f of FIELDS) {
    const { tp, fp, fn, tn } = agg[f];
    const presentPos = tp + fn;
    const presentPred = tp + fp;
    metrics[f] = {
      present_labelled: presentPos,
      present_predicted: presentPred,
      precision: presentPred === 0 ? null : tp / presentPred,
      recall: presentPos === 0 ? null : tp / presentPos,
      false_additions: fp,
      false_omissions: fn,
    };
  }
  return {
    metrics,
    totals: {
      bothNull: totalBothNull,
      oneNull: totalOneNull,
      bothPresent: totalBothPresent,
      correct: correctCount,
      measured_fields: totalFieldsMeasured,
      // null agreement = both-null / total field checks; reported separately
      // from accuracy, per D2B §17 ("null agreement reported separately,
      // never headline accuracy").
      nullAgreementPct: pct(totalBothNull, totalBothNull + totalOneNull + totalBothPresent),
    },
  };
}

export async function run({ inputPath, predictionPath, split, stdout }) {
  const out = (s) => stdout(s);

  // 1. Held-out / test split needs freeze gate.
  const gate = checkFreezeGate(split);
  if (!gate.ok) {
    out(notMeasuredMessage("eval:extract", `freeze gate refused: ${gate.reason}`) + "\n");
    return { measured: false, reason: "freeze-gate", split, gate };
  }

  // 2. Locate labelled file.
  let labelledPath = inputPath;
  if (!labelledPath) {
    const candidate = join(EVAL_DATA_DIR, "labelled.jsonl");
    if (existsSyncLite(candidate)) labelledPath = candidate;
    else labelledPath = join(EVAL_DATA_DIR, "labelled.draft.jsonl");
  }
  const labelledFile = safeReadJsonl(labelledPath);
  if (!labelledFile.present) {
    out(notMeasuredMessage("eval:extract", `labelled file missing: ${labelledPath}`) + "\n");
    return { measured: false, reason: "no-labels", split, path: labelledPath };
  }
  const labels = labelledFile.rows;
  if (labels.length === 0) {
    out(notMeasuredMessage("eval:extract", "0 labelled records") + "\n");
    return { measured: false, reason: "empty-labels", split, path: labelledPath };
  }

  // 3. Human-empty detection (D2B §17: human labels are required).
  if (!hasAnyLabel(labels)) {
    out(notMeasuredMessage("eval:extract", "labels are human-empty in this labelled file; no measurement produced (TASK-011 reviewer has not signed off)") + "\n");
    return {
      measured: false, reason: "human-empty", split, path: labelledPath,
      denominator: labels.length,
      note: "Denominator is the number of human-drafted inputs, not predictions.",
    };
  }

  // 4. Predictions are required and explicit.
  if (!predictionPath) {
    out(notMeasuredMessage("eval:extract", "no --prediction file provided; pass an explicit measured predictions JSONL") + "\n");
    return { measured: false, reason: "no-predictions", split };
  }
  const predFile = safeReadJsonl(predictionPath);
  if (!predFile.present) {
    out(notMeasuredMessage("eval:extract", `prediction file missing: ${predictionPath}`) + "\n");
    return { measured: false, reason: "missing-predictions", split };
  }
  if (predFile.rows.length === 0) {
    out(notMeasuredMessage("eval:extract", "0 prediction rows") + "\n");
    return { measured: false, reason: "empty-predictions", split };
  }

  // 5. Cache/fixture hits invalid (TC-056). Count and exclude.
  const cacheHits = predFile.rows.filter(detectCacheHit);
  const cleanPred = predFile.rows.filter((p) => !detectCacheHit(p));
  const cacheHitsCount = cacheHits.length;
  const cleanCount = cleanPred.length;
  if (cleanCount === 0) {
    out(notMeasuredMessage("eval:extract", `all ${cacheHitsCount} predictions were cache/fixture hits`) + "\n");
    return { measured: false, reason: "all-cache", split, cacheHits: cacheHitsCount };
  }

  // 6. Pair by id; warn on missing.
  const labelById = new Map();
  for (const l of labels) labelById.set(l.id, l);
  const predById = new Map();
  for (const p of cleanPred) predById.set(p.id, p);
  const matchedIds = [];
  const orphanPreds = [];
  const missingPreds = [];
  for (const [id, p] of predById) {
    if (labelById.has(id)) matchedIds.push(id);
    else orphanPreds.push(id);
  }
  for (const [id] of labelById) {
    if (!predById.has(id)) missingPreds.push(id);
  }

  // 7. Score.
  const perRecord = [];
  const failures = [];
  for (const id of matchedIds) {
    const label = labelById.get(id);
    const prediction = predById.get(id);
    const scored = scoreRecord(label.labels || {}, prediction.draft || prediction);
    perRecord.push({ id, ...scored });
    // Failure: any false addition OR any false omission OR any value mismatch.
    const hasFailure = Object.values(scored.perField).some(
      (p) => p.false_add || p.false_omission || (p.present_labelled && p.present_predicted && !p.value_match),
    );
    if (hasFailure) failures.push(id);
  }
  const agg = aggregateScores(perRecord);

  // 8. Split info: how many of the matched labels are in the current split?
  const manifest = loadManifest();
  const splitInfo = loadSplitRecords(split);
  let inSplit = matchedIds.length;
  if (manifest && splitInfo) {
    inSplit = matchedIds.filter((id) => splitInfo.recordIds.has(id)).length;
  }

  // 9. Report.
  const lines = [];
  lines.push("eval:extract summary");
  lines.push(`  labelled file:        ${labelledPath} (sha256 ${fileSha256(labelledPath).slice(0, 12)}...)`);
  lines.push(`  prediction file:      ${predictionPath}`);
  lines.push(`  split:                ${split}`);
  lines.push(`  manifest hash:        ${manifest ? (manifest.inputs?.ground_truth_sha256?.slice(0, 12) ?? "n/a") + "..." : "n/a"}`);
  lines.push(`  commit:               ${gitHeadShort() ?? "n/a"}`);
  lines.push(`  cache/fixture hits excluded: ${cacheHitsCount}`);
  lines.push(`  total labelled records (denominator): ${labels.length}`);
  lines.push(`  matched (id present in both):         ${matchedIds.length}`);
  lines.push(`  of which in ${split} split:            ${inSplit}`);
  lines.push(`  orphan predictions (no label):        ${orphanPreds.length}`);
  lines.push(`  labels without a prediction:          ${missingPreds.length}`);
  // Per-field precision/recall.
  lines.push("  per-field precision/recall (n = number of present labelled):");
  for (const f of FIELDS) {
    const m = agg.metrics[f];
    if (m.present_labelled === 0 && m.present_predicted === 0) continue;
    lines.push(
      `    ${f}: precision=${fmtPercent(m.precision === null ? null : m.precision * 100)} ` +
      `recall=${fmtPercent(m.recall === null ? null : m.recall * 100)} ` +
      `n_labelled=${m.present_labelled} false_add=${m.false_additions} false_omission=${m.false_omissions}`,
    );
  }
  // Headline accuracy EXCLUDES both-null pairs (D2B §17).
  const headlineDenom = agg.totals.bothPresent;
  const headlineNum = matchedIds.length === 0
    ? 0
    : Math.round(agg.totals.correct - agg.totals.bothNull);
  const headline = pct(headlineNum, headlineDenom);
  lines.push(`  headline (present-field) accuracy: ${fmtPercent(headline === null ? null : headline)} (${headlineNum}/${headlineDenom}) — null agreement reported separately, never headline accuracy`);
  lines.push(`  null agreement (both null): ${fmtPercent(agg.totals.nullAgreementPct)} (${agg.totals.bothNull}/${agg.totals.bothNull + agg.totals.oneNull + agg.totals.bothPresent})`);
  // Failure examples (NEVER invent two).
  if (failures.length === 0) {
    lines.push("  failures: none observed");
  } else {
    const sample = failures.slice(0, 5);
    lines.push(`  failures: ${failures.length} record(s) with at least one false addition, false omission or value mismatch (e.g. ${sample.join(", ")})`);
  }
  out(lines.join("\n") + "\n");

  return {
    measured: true,
    split,
    input: labelledPath,
    prediction: predictionPath,
    cacheHitsExcluded: cacheHitsCount,
    matched: matchedIds.length,
    inSplit,
    orphanPreds,
    missingPreds,
    metrics: agg.metrics,
    totals: agg.totals,
    headline,
    failures,
  };
}

function existsSyncLite(p) {
  return existsSync(p);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  try {
    const result = await run({
      inputPath: args.input,
      predictionPath: args.prediction,
      split: args.split,
      stdout: process.stdout.write.bind(process.stdout),
    });
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Never echo child text from a malformed line.
    process.stderr.write(`eval:extract: ${msg}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, scoreRecord, aggregateScores, FIELDS, detectCacheHit, notMeasuredMessage };
