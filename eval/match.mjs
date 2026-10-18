#!/usr/bin/env node
// eval:match — P3-211 / TC-020 / TASK-039 GOAL-003.
//
// D2B §17 matcher evaluation: Recall@5 on true pairs, top-1 accuracy,
// coverage, abstention, P@5 and an aggregate shortlist precision.
// Identity-grouped dev/test split (TASK-064 / TC-064) is loaded from the
// committed manifest. Held-out (test) split requires the freeze gate. We
// compute against an explicit --prediction file: {id, ranked: [foundId, ...]}.
// We never call a model. Predictions without a label are excluded and
// counted. Cache / fixture hits are excluded and counted (TC-056).
import {
  REPO_ROOT, MANIFEST_PATH, checkFreezeGate, fileSha256, safeReadJsonl, safeReadJson,
  notMeasuredMessage, gitHeadShort, loadManifest, loadSplitRecords,
  splitInfoFromManifest, pct, fmtPercent,
} from "./metric-utils.mjs";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: node eval/match.mjs [--split dev|heldout] [--prediction <file>]";

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
    process.stderr.write(`eval:match: ${out.errors.join("; ")}\n${USAGE}\n`);
    process.exit(2);
  }
  return out;
}

function helpText() {
  return [
    "node eval/match.mjs — Matching evaluation (D2B §17, GOAL-003, TC-020).",
    "",
    "Reads the canonical identity-grouped manifest (eval/manifest.json)",
    "and evaluates an explicit",
    "--prediction file of {id, ranked: [foundId, ...]} against true partners",
    "and no-match labels.",
    "",
    "Options:",
    "  --split dev|heldout   which split to evaluate (default dev)",
    "  --prediction <file>   JSONL predictions, one per query id",
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
 * Build the labelled query set from the ground truth + manifest split.
 *   - pair_query rows with at least one true_partner_id are TRUE-PAIR queries.
 *     The set of ground-truth true partners is the union of true_partner_ids.
 *   - no_match_query rows (kind=missing, no_match=true) are NO-MATCH queries:
 *     they should be empty/abstain.
 * Duplicate / decoy rows are NOT queries.
 */
export function buildQueries({ records, manifest, split }) {
  const splitInfo = splitInfoFromManifest(manifest, split);
  if (!splitInfo) return { present: false, splitInfo: null };
  const ids = new Set(splitInfo.record_ids);
  const truthPairQueries = [];
  const noMatchQueries = [];
  const falseCandidates = []; // decoys that should be excluded from partner lists
  const decoysByQuery = new Map(); // queryId -> { decoys: [...] }
  const partnerSet = new Map(); // queryId -> Set of true partner ids
  for (const r of records) {
    if (!ids.has(r.record_id)) continue;
    if (r.role === "pair_query") {
      truthPairQueries.push(r.record_id);
      partnerSet.set(r.record_id, new Set(r.true_partner_ids || []));
    }
    if (r.kind === "missing" && r.no_match) {
      noMatchQueries.push(r.record_id);
    }
    // decoy: should NOT be in the partner list of any same-query
    if (r.role === "decoy" || (r.decoy_type && r.decoy_type !== null)) {
      const targets = r.decoy_target_ids || [];
      for (const t of targets) {
        if (!decoysByQuery.has(t)) decoysByQuery.set(t, []);
        decoysByQuery.get(t).push(r.record_id);
      }
      if (r.role === "decoy") falseCandidates.push(r.record_id);
    }
  }
  return {
    present: true,
    splitInfo,
    truthPairQueries,
    noMatchQueries,
    falseCandidates,
    decoysByQuery,
    partnerSet,
  };
}

export function scorePredictions({ queries, predictionsById }) {
  // Recall@5 / top-1 / P@5 are scored against TRUE-pair queries only.
  // A no-match query returning a non-empty list is a FALSE POSITIVE
  // (the detector promised a partner when the truth says no partner
  // exists). It is NEVER folded into recall@5 / top-1 / P@5 — the
  // denominators for those metrics are the truth-pair queries, and a
  // false-positive suggestion has no defensible "truth-pair" position.
  // The two failure classes are tracked separately so the printed
  // report can name them (D2B §17: failures are taken from real
  // output, never invented).
  let recallAt5Hits = 0;       // of TRUE-pair queries, did the top-5 contain ANY true partner?
  let top1Hits = 0;            // of TRUE-pair queries, was the top-1 a true partner?
  let top1Considered = 0;      // truth-pair queries that returned a non-empty shortlist
  let coveredShortlists = 0;   // truth-pair queries that returned a non-empty shortlist
  let emptyShortlists = 0;     // truth-pair queries with no prediction / empty shortlist
  let falsePositiveSuggestions = 0; // of NO-MATCH queries, did we return ANY candidate?
  // P@5: average precision over truth-pair queries, using the
  // returned shortlist length (up to 5) as the divisor. An empty
  // shortlist contributes precision 0 (we do NOT drop abstentions
  // from the denominator — that would inflate the metric by hiding
  // the cases the detector failed to serve). The denominator is the
  // number of truth-pair queries, so a measured shortlist of length
  // < 5 lowers the average, never raises it.
  let pAt5Num = 0;
  const falsePosDecoysAcross = new Map(); // queryId -> number of decoys
  const truthPairMisses = [];   // truth-pair queries that failed (empty / no hit)
  const noMatchFalsePositives = []; // no-match queries that returned a non-empty list
  for (const qid of queries.truthPairQueries) {
    const partners = queries.partnerSet.get(qid) || new Set();
    const p = predictionsById.get(qid);
    if (!p) {
      emptyShortlists += 1;
      truthPairMisses.push(qid);
      // P@5: a missing prediction contributes 0 to the numerator;
      // we do NOT exclude it from the denominator.
      pAt5Num += 0;
      continue;
    }
    const ranked = Array.isArray(p.ranked) ? p.ranked.slice(0, 5) : [];
    if (ranked.length === 0) {
      emptyShortlists += 1;
      truthPairMisses.push(qid);
      pAt5Num += 0;
      continue;
    }
    const decoys = queries.decoysByQuery.get(qid) || [];
    const decoysRecommended = ranked.filter((c) => decoys.includes(c)).length;
    if (decoysRecommended > 0) falsePosDecoysAcross.set(qid, decoysRecommended);
    // top-1
    top1Considered += 1;
    if (partners.has(ranked[0])) top1Hits += 1;
    // recall@5: any true partner in the top-5
    const hit = ranked.some((c) => partners.has(c));
    if (hit) recallAt5Hits += 1;
    coveredShortlists += 1;
    // P@5: precision at the actual shortlist length, never padded
    // up to 5. An empty/short shortlist contributes a smaller
    // fraction, which is the honest measure.
    const relevant = ranked.filter((c) => partners.has(c)).length;
    pAt5Num += relevant / ranked.length;
    if (!hit) truthPairMisses.push(qid);
  }
  for (const qid of queries.noMatchQueries) {
    const p = predictionsById.get(qid);
    if (!p) continue;
    const ranked = Array.isArray(p.ranked) ? p.ranked : [];
    if (ranked.length > 0) {
      falsePositiveSuggestions += 1;
      noMatchFalsePositives.push(qid);
    }
  }
  const totalTruth = queries.truthPairQueries.length;
  const totalNoMatch = queries.noMatchQueries.length;
  const recallAt5 = pct(recallAt5Hits, totalTruth);
  // Top-1 denominator is the COVERED truth-pair queries (those that
  // returned a non-empty shortlist). An empty shortlist cannot be
  // a top-1 hit; it would be a tautology. We report the explicit
  // numerator/denominator so a reader can see the covered/empty
  // split.
  const top1 = pct(top1Hits, top1Considered);
  const coverage = pct(coveredShortlists, totalTruth);
  const abstention = pct(emptyShortlists, totalTruth);
  // P@5 denominator is the truth-pair query count (every query
  // contributes its slice, including empty/zero). We never exclude
  // abstentions to inflate quality.
  const pAt5 = pct(pAt5Num, totalTruth);
  const falsePosRate = pct(falsePositiveSuggestions, totalNoMatch);
  return {
    totalTruthPairs: totalTruth,
    totalNoMatchQueries: totalNoMatch,
    recallAt5,
    top1,
    top1Hits,
    top1Considered,
    coverage,
    abstention,
    pAt5,
    pAt5Num,
    falsePosRate,
    falsePositiveSuggestions,
    truthPairMisses,
    noMatchFalsePositives,
    // `failures` is the union of the two failure classes for
    // backward compatibility with callers that did not distinguish
    // them. New readers should consult `truthPairMisses` and
    // `noMatchFalsePositives` separately.
    failures: Array.from(new Set([...truthPairMisses, ...noMatchFalsePositives])),
    falsePosDecoysAcross: Array.from(falsePosDecoysAcross.entries()),
  };
}

export async function run({ split, predictionPath, stdout }) {
  const out = (s) => stdout(s);

  // 1. Held-out gate.
  const gate = checkFreezeGate(split);
  if (!gate.ok) {
    out(notMeasuredMessage("eval:match", `freeze gate refused: ${gate.reason}`) + "\n");
    return { measured: false, reason: "freeze-gate", split };
  }

  // 2. Manifest.
  const manifest = loadManifest();
  if (!manifest) {
    out(notMeasuredMessage("eval:match", "manifest.json missing or malformed; the held-out split depends on it (TC-064)") + "\n");
    return { measured: false, reason: "no-manifest", split };
  }

  // 3. Ground truth.
  const truth = loadGroundTruth();
  if (!truth) {
    out(notMeasuredMessage("eval:match", "ground_truth.json missing or malformed") + "\n");
    return { measured: false, reason: "no-truth", split };
  }

  // 4. Splits.
  const splitInfo = loadSplitRecords(split);
  if (!splitInfo) {
    out(notMeasuredMessage("eval:match", `manifest does not contain split "${split}"`) + "\n");
    return { measured: false, reason: "no-split", split };
  }

  // 5. Build queries.
  const queries = buildQueries({ records: truth.records, manifest, split });
  if (!queries.present) {
    out(notMeasuredMessage("eval:match", "split has no records") + "\n");
    return { measured: false, reason: "empty-split", split };
  }

  // 6. Prediction file is mandatory and explicit.
  if (!predictionPath) {
    out(notMeasuredMessage("eval:match", "no --prediction file provided") + "\n");
    return { measured: false, reason: "no-prediction", split };
  }
  const pred = safeReadJsonl(predictionPath);
  if (!pred.present) {
    out(notMeasuredMessage("eval:match", `prediction file missing: ${predictionPath}`) + "\n");
    return { measured: false, reason: "missing-prediction", split };
  }
  if (pred.rows.length === 0) {
    out(notMeasuredMessage("eval:match", "0 prediction rows") + "\n");
    return { measured: false, reason: "empty-prediction", split };
  }
  const clean = pred.rows.filter((p) => !detectCacheHit(p));
  const cacheHits = pred.rows.length - clean.length;
  if (clean.length === 0) {
    out(notMeasuredMessage("eval:match", `all ${cacheHits} predictions were cache/fixture hits`) + "\n");
    return { measured: false, reason: "all-cache", split, cacheHits };
  }
  const predictionsById = new Map();
  for (const p of clean) predictionsById.set(p.id, p);

  // 7. Score.
  const scored = scorePredictions({ queries, predictionsById });

  // 8. Report.
  const lines = [];
  lines.push("eval:match summary");
  lines.push(`  split:                  ${split}`);
  lines.push(`  commit:                 ${gitHeadShort() ?? "n/a"}`);
  lines.push(`  manifest hash (sha256 of eval/manifest.json): ${fileSha256(MANIFEST_PATH).slice(0, 12)}...`);
  lines.push(`  ground-truth hash (from manifest.inputs):     ${manifest.inputs?.ground_truth_sha256?.slice(0, 12) ?? "n/a"}...`);
  lines.push(`  prediction file:        ${predictionPath}`);
  lines.push(`  cache/fixture excluded: ${cacheHits}`);
  lines.push(`  truth-pair queries (denom for recall@5 / P@5): ${scored.totalTruthPairs}`);
  lines.push(`  no-match queries (denom for FP rate):          ${scored.totalNoMatchQueries}`);
  lines.push(`  recall@5 on truth pairs:                       ${fmtPercent(scored.recallAt5)} (${scored.truthPairMisses.length} true-pair miss)`);
  lines.push(`  top-1 accuracy on covered truth pairs:         ${fmtPercent(scored.top1)} (${scored.top1Hits}/${scored.top1Considered})`);
  lines.push(`  P@5 on truth pairs:                            ${fmtPercent(scored.pAt5)} (denom=${scored.totalTruthPairs}, all truth-pair queries including empty/zero; abstentions never excluded)`);
  lines.push(`  coverage (non-empty shortlist on truth pairs): ${fmtPercent(scored.coverage)}`);
  lines.push(`  abstention (empty shortlist on truth pairs):   ${fmtPercent(scored.abstention)}`);
  lines.push(`  false-positive suggestion rate on no-match:    ${fmtPercent(scored.falsePosRate)} (${scored.falsePositiveSuggestions}/${scored.totalNoMatchQueries}, ${scored.noMatchFalsePositives.length} no-match FP)`);
  if (scored.truthPairMisses.length === 0 && scored.noMatchFalsePositives.length === 0) {
    lines.push("  failures: none observed");
  } else {
    const truthSample = scored.truthPairMisses.slice(0, 5);
    const noMatchSample = scored.noMatchFalsePositives.slice(0, 5);
    if (truthSample.length > 0) {
      lines.push(`  failures (true-pair miss, first 5): ${truthSample.join(", ")}`);
    }
    if (noMatchSample.length > 0) {
      lines.push(`  failures (no-match FP, first 5):    ${noMatchSample.join(", ")}`);
    }
  }
  out(lines.join("\n") + "\n");

  return { measured: true, split, ...scored, cacheHits, totalQueries: queries.truthPairQueries.length + queries.noMatchQueries.length };
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
    process.stderr.write(`eval:match: ${msg}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, buildQueries, scorePredictions, detectCacheHit, notMeasuredMessage };
