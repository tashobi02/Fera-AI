#!/usr/bin/env node
// eval:dedupe — P3-211 / TC-020 / TASK-039 GOAL-004.
//
// D2B §17 duplicate evaluation: pairwise precision/recall/F1 on the 25
// declared same-identity duplicate links plus a distinct-child / shared-phone
// negative set. We also count false-consolidation (a distinct-child pair
// flagged as duplicate) and hidden-report count (a pair that should NOT be
// hidden that the detector hides). Detection only; no claimed merge accuracy.
// Cache / fixture hits and held-out split require the freeze gate.
import {
  REPO_ROOT, checkFreezeGate, fileSha256, safeReadJsonl, safeReadJson,
  notMeasuredMessage, gitHeadShort, loadManifest, loadSplitRecords,
  splitInfoFromManifest, pct, fmtPercent,
} from "./metric-utils.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: node eval/dedupe.mjs [--split dev|heldout] [--prediction <file>]";

function parseArgs(argv) {
  const out = { split: "dev", prediction: null, help: false, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--split") out.split = argv[++i];
    else if (a === "--prediction") out.prediction = argv[++i];
    else if (a === "--heldout") out.split = "heldout";
    else if (a === "--dev") out.split = "dev";
    else out.errors.push(`unknown argument: ${a}`);
  }
  if (!["dev", "heldout", "test"].includes(out.split)) {
    out.errors.push(`split must be dev|heldout|test, got ${out.split}`);
  }
  if (out.errors.length && !out.help) {
    process.stderr.write(`eval:dedupe: ${out.errors.join("; ")}\n${USAGE}\n`);
    process.exit(2);
  }
  return out;
}

function helpText() {
  return [
    "node eval/dedupe.mjs — Duplicate evaluation (D2B §17, GOAL-004, TC-020).",
    "",
    "Reads the canonical manifest (eval/manifest.json) and the ground-truth",
    "duplicate links (25",
    "declared same-identity links + the shared-phone distinct-child negatives)",
    "and an explicit --prediction file of {id, links: [{a, b, rule}]}.",
    "",
    "Options:",
    "  --split dev|heldout   which split to evaluate (default dev)",
    "  --prediction <file>   JSONL predictions, one per source id",
    "  --heldout             shortcut for --split heldout",
    "  --help                this help",
    "",
    "Test runs require FREEZE_FLAG: SET in eval/FREEZE.md and a valid",
    "canonical manifest hash. Environment variables cannot unlock test.",
  ].join("\n");
}

function detectCacheHit(prediction) {
  if (prediction && prediction.fixture_id) return true;
  if (prediction && prediction.cache_hit === true) return true;
  if (prediction && prediction.source === "fixture") return true;
  if (prediction && prediction.source === "cache") return true;
  return false;
}

function loadGroundTruth() {
  const f = safeReadJson(join(REPO_ROOT, "data", "synthetic", "ground_truth.json"));
  if (!f.present || f.malformed || !f.value || !Array.isArray(f.value.records)) return null;
  return f.value;
}

/**
 * Build labelled duplicate pairs and distinct-child negatives from the
 * ground truth + manifest split.
 *   - True positive (TP): same duplicate_group_id, both in split
 *     (the union of pairs within each group)
 *   - True negative (TN): distinct identity, no shared phone. The simplest
 *     construction is to take all ordered pairs (a,b) of records in the
 *     split that share neither identity_id nor phone; sampled.
 *   - Shared-phone distinct children are explicitly negative (TC-038).
 */
export function buildDuplicateSet({ records, manifest, split }) {
  const splitInfo = splitInfoFromManifest(manifest, split);
  if (!splitInfo) return { present: false };
  const ids = new Set(splitInfo.record_ids);
  // Lookup by record_id
  const byId = new Map();
  for (const r of records) if (ids.has(r.record_id)) byId.set(r.record_id, r);
  const truePairs = [];
  const sharedPhoneDistinct = [];
  const byGroup = new Map();
  for (const r of records) {
    if (!ids.has(r.record_id)) continue;
    if (r.duplicate_group_id) {
      if (!byGroup.has(r.duplicate_group_id)) byGroup.set(r.duplicate_group_id, []);
      byGroup.get(r.duplicate_group_id).push(r.record_id);
    }
  }
  for (const [, list] of byGroup) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        truePairs.push([list[i], list[j]]);
      }
    }
  }
  // Shared-phone distinct-child negatives (TC-038 / BR-021). Records carry
  // `phone_shared_with_other_identities` (a list of record_ids that share
  // the reporter's phone but are not the same child). Build unique unordered
  // pairs restricted to records inside the current split. Targeted
  // rejection rates are reported, not the simple pairwise metric.
  const seenShared = new Set();
  for (const r of records) {
    if (!ids.has(r.record_id)) continue;
    const list = Array.isArray(r.phone_shared_with_other_identities) ? r.phone_shared_with_other_identities : [];
    for (const other of list) {
      if (!ids.has(other)) continue;
      if (r.record_id === other) continue;
      const key = r.record_id < other ? `${r.record_id}|${other}` : `${other}|${r.record_id}`;
      seenShared.add(key);
    }
  }
  for (const key of seenShared) {
    const [a, b] = key.split("|");
    sharedPhoneDistinct.push([a, b]);
  }
  // All distinct-identity pairs in the split count as TN-candidates.
  // We keep them but report the actual count as denominator.
  const allInSplit = Array.from(byId.keys());
  return {
    present: true,
    splitInfo,
    truePairs,
    sharedPhoneDistinct,
    candidatesCount: allInSplit.length,
  };
}

/**
 * Build predicted set from {id, links: [{a, b, rule}]}.
 * Returns the set of predicted positive pairs (unordered). When
 * `restrictToIds` is provided, pairs that contain an id outside that
 * set are dropped (used to keep scoring on the requested split).
 */
export function buildPredictedPositives(predictions, restrictToIds) {
  const out = new Set();
  for (const p of predictions) {
    if (!p || !Array.isArray(p.links)) continue;
    for (const link of p.links) {
      if (!link || typeof link.a !== "string" || typeof link.b !== "string") continue;
      if (restrictToIds && (!restrictToIds.has(link.a) || !restrictToIds.has(link.b))) continue;
      const a = link.a < link.b ? link.a : link.b;
      const b = link.a < link.b ? link.b : link.a;
      out.add(`${a}|${b}`);
    }
  }
  return out;
}

function toKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function scoreDedupe({ truePairs, predicted, sharedPhoneNegativePairs }) {
  const truthSet = new Set();
  for (const [a, b] of truePairs) truthSet.add(toKey(a, b));
  let tp = 0, fp = 0;
  for (const k of predicted) {
    if (truthSet.has(k)) tp += 1;
    else fp += 1;
  }
  const fn = truthSet.size - tp;
  const precision = pct(tp, tp + fp);
  const recall = pct(tp, truthSet.size);
  const f1 = (precision === null || recall === null || (precision + recall) === 0)
    ? null
    : (2 * precision * recall) / (precision + recall);
  // Targeted shared-phone distinct-child rejection. Counts:
  //   sharedPhoneNegativeTotal  = pairs in the ground truth list (in-split)
  //   sharedPhoneNegativeFp      = detector predicted those pairs as positive
  //   sharedPhoneNegativeRejected = detector correctly refused those pairs
  let sharedPhoneNegativeTotal = 0;
  let sharedPhoneNegativeFp = 0;
  let sharedPhoneNegativeRejected = 0;
  if (Array.isArray(sharedPhoneNegativePairs)) {
    for (const [a, b] of sharedPhoneNegativePairs) {
      const key = toKey(a, b);
      sharedPhoneNegativeTotal += 1;
      if (predicted.has(key)) sharedPhoneNegativeFp += 1;
      else sharedPhoneNegativeRejected += 1;
    }
  }
  return {
    tp, fp, fn, truthSize: truthSet.size, precision, recall, f1,
    sharedPhoneNegativeTotal,
    sharedPhoneNegativeFp,
    sharedPhoneNegativeRejected,
  };
}

export async function run({ split, predictionPath, stdout }) {
  const out = (s) => stdout(s);

  // 1. Held-out gate.
  const gate = checkFreezeGate(split);
  if (!gate.ok) {
    out(notMeasuredMessage("eval:dedupe", `freeze gate refused: ${gate.reason}`) + "\n");
    return { measured: false, reason: "freeze-gate", split };
  }

  // 2. Manifest.
  const manifest = loadManifest();
  if (!manifest) {
    out(notMeasuredMessage("eval:dedupe", "manifest.json missing or malformed") + "\n");
    return { measured: false, reason: "no-manifest", split };
  }

  // 3. Ground truth.
  const truth = loadGroundTruth();
  if (!truth) {
    out(notMeasuredMessage("eval:dedupe", "ground_truth.json missing or malformed") + "\n");
    return { measured: false, reason: "no-truth", split };
  }

  // 4. Build the truth set.
  const dup = buildDuplicateSet({ records: truth.records, manifest, split });
  if (!dup.present) {
    out(notMeasuredMessage("eval:dedupe", `manifest does not contain split "${split}"`) + "\n");
    return { measured: false, reason: "no-split", split };
  }
  if (dup.truePairs.length === 0) {
    out(notMeasuredMessage("eval:dedupe", "0 declared duplicate pairs in this split") + "\n");
    return { measured: false, reason: "empty-truth", split };
  }

  // 5. Predictions.
  if (!predictionPath) {
    out(notMeasuredMessage("eval:dedupe", "no --prediction file provided") + "\n");
    return { measured: false, reason: "no-prediction", split };
  }
  const pred = safeReadJsonl(predictionPath);
  if (!pred.present) {
    out(notMeasuredMessage("eval:dedupe", `prediction file missing: ${predictionPath}`) + "\n");
    return { measured: false, reason: "missing-prediction", split };
  }
  if (pred.rows.length === 0) {
    out(notMeasuredMessage("eval:dedupe", "0 prediction rows") + "\n");
    return { measured: false, reason: "empty-prediction", split };
  }
  const clean = pred.rows.filter((p) => !detectCacheHit(p));
  const cacheHits = pred.rows.length - clean.length;
  if (clean.length === 0) {
    out(notMeasuredMessage("eval:dedupe", `all ${cacheHits} predictions were cache/fixture hits`) + "\n");
    return { measured: false, reason: "all-cache", split, cacheHits };
  }
  const predicted = buildPredictedPositives(clean);

  // 6. Score (with shared-phone distinct-child negative tracking).
  const scored = scoreDedupe({
    truePairs: dup.truePairs,
    predicted,
    sharedPhoneNegativePairs: dup.sharedPhoneDistinct,
  });

  // 7. Report.
  const lines = [];
  lines.push("eval:dedupe summary");
  lines.push(`  split:                  ${split}`);
  lines.push(`  commit:                 ${gitHeadShort() ?? "n/a"}`);
  lines.push(`  manifest hash:          ${manifest.inputs?.ground_truth_sha256?.slice(0, 12) ?? "n/a"}...`);
  lines.push(`  prediction file:        ${predictionPath}`);
  lines.push(`  cache/fixture excluded: ${cacheHits}`);
  lines.push(`  declared duplicate pairs (denominator): ${scored.truthSize}`);
  lines.push(`  TP: ${scored.tp}  FP: ${scored.fp}  FN: ${scored.fn}`);
  lines.push(`  pairwise precision: ${fmtPercent(scored.precision)} (${scored.tp}/${scored.tp + scored.fp})`);
  lines.push(`  pairwise recall:    ${fmtPercent(scored.recall)} (${scored.tp}/${scored.truthSize})`);
  lines.push(`  pairwise F1:        ${fmtPercent(scored.f1)}`);
  if (scored.fn === 0 && scored.fp === 0) {
    lines.push("  failures: none observed");
  } else {
    const failureType = scored.fn > 0 && scored.fp > 0
      ? "false consolidation (FP) and misses (FN)"
      : scored.fn > 0
        ? "misses (FN)"
        : "false consolidations (FP)";
    lines.push(`  failures: ${failureType}; counts above`);
  }
  // Shared-phone distinct-child rejection (TC-038). Targeted rejection
  // is reported separately from overall pairwise precision/recall: BR-021
  // (shared phone alone never establishes the same child).
  if (scored.sharedPhoneNegativeTotal > 0) {
    const total = scored.sharedPhoneNegativeTotal;
    const fp = scored.sharedPhoneNegativeFp;
    const rej = scored.sharedPhoneNegativeRejected;
    lines.push(
      `  shared-phone distinct-child rejection: ${rej}/${total} refused ` +
      `(targeted FP ${fp}/${total})`,
    );
  }
  out(lines.join("\n") + "\n");

  return { measured: true, split, ...scored, cacheHits };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  try {
    const result = await run({
      split: args.split,
      predictionPath: args.prediction,
      stdout: process.stdout.write.bind(process.stdout),
    });
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`eval:dedupe: ${msg}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, buildDuplicateSet, buildPredictedPositives, scoreDedupe, detectCacheHit, notMeasuredMessage };
