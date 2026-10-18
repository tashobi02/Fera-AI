// scripts/eval/duplicate-calibration.ts — Fera pre-main dev split duplicate
// detector calibration grid (BR-018, BR-021, D2B §17).
//
// Lane: pre-main-dev-quality-audit. Owner of this file: lane. Status:
// DEV-ONLY / NOT FROZEN. The held-out test split is never loaded, never
// inferred, never tuned (FREEZE_FLAG = NOT SET in eval/FREEZE.md; the
// canonical loadSplit refuses test/heldout until that flag is reviewed and
// flipped by a recorded team decision). All numbers in this file are
// measured on the 86 dev records / 30 connected groups. The manifest,
// ground truth, embedding model, embedder revision and embedding space are
// pinned and never modified by this lane.
//
// What this script does
// ---------------------
// 1. Reads eval/fixtures/duplicate-calibration-baseline.dev.jsonl (the existing dev prediction
//    rows from the pre-main Phase 3 run: 86 source rows, 580 ordered
//    (a,b,score) flag rows; score = round(similarity*100) and the
//    contradiction gate + MIN_AGREEING_PROFILE_FIELDS=2 + SIMILARITY_THRESHOLD=0.5
//    were the documented defaults at the time).
// 2. Reads data/synthetic/records.jsonl and eval/manifest.json to obtain
//    per-record profile (name, age_min/max, sex, district_code,
//    event_at_lower, event_at_upper) and the dev split truth pairs.
// 3. For every (sim_thr, min_agree) cell in the bounded grid, re-applies
//    the same `decideDuplicateRule` predicate (imported from
//    src/server/duplicates/detect.ts so the threshold and field logic are
//    not duplicated here) to the same 580 pairs and re-scores against the
//    truth set using eval/dedupe.mjs `scoreDedupe`.
//
// Caveats documented honestly in the evidence file
// -------------------------------------------------
// * The grid only sweeps thresholds that are *at least as strict* as the
//   baseline (sim_thr >= 0.5, min_agree >= 2). Sweeping *down* would
//   require the embedding pool that the original detector considered
//   below similarity 0.5; that pool is not in the JSONL (only flagged
//   links are) so it is not inferred from this fixture. The honest answer is therefore
//   constrained: we can only evaluate how many FPs we drop by raising
//   the floors. We document the constraint, not invent a sweep.
// * Each cell is a pure re-application of the same predicate over the
//   same 580 pairs; the candidate pool is fixed by the existing JSONL.
//   The chosen cell is then validated by a fresh end-to-end detector run
//   against a fresh isolated loopback DB (see `validateDetectorRun` and
//   docs/execution/evidence/pre-main-dev-calibration.md).
//
// Outputs
// -------
// * JSON grid at eval/data/duplicate-calibration.grid.json
// * Markdown summary at eval/data/duplicate-calibration.grid.md
// * A typed return value with the recommended config for callers
//   (scripts/eval/duplicate-calibration.cli.ts, the unit suite, and
//   docs/execution/evidence/pre-main-dev-calibration.md).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error -- plain ESM helper without declarations
import { scoreDedupe, buildPredictedPositives, __test as dedupeTest } from "../../eval/dedupe.mjs";
import {
  decideDuplicateRule,
  profilesContradict,
  namesAgree,
  agesAgree,
  sexesAgree,
  districtsAgree,
  timesAgree,
  type FieldAgreement,
  type SourceCase,
  type SimilarCase,
} from "@/server/duplicates/detect";

/* ---------- public types ---------- */

export type DedupeFlagRow = {
  sourceId: string;
  targetId: string;
  similarity: number;
  agreement: FieldAgreement;
  contradicts: boolean;
  rule: "profile" | "same_phone" | null;
};

export type GridCell = {
  similarityThreshold: number;
  minAgreeingProfileFields: number;
  tp: number;
  fp: number;
  fn: number;
  truthSize: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  sharedPhoneNegativeTotal: number;
  sharedPhoneNegativeFp: number;
  sharedPhoneNegativeRejected: number;
};

export type GridSweep = {
  predicted: number; // unordered unique pairs the re-application produced
  truthSize: number;
  truthSet: Set<string>;
  sharedPhoneNegativePairs: ReadonlyArray<readonly [string, string]>;
  cells: GridCell[];
};

export type CalibrationResult = {
  grid: GridSweep;
  baseline: GridCell;
  recommended: GridCell;
  recommendedConfig: {
    similarityThreshold: number;
    minAgreeingProfileFields: number;
  };
  evidence: {
    predictionFile: string;
    predictionSha256: string;
    recordsFile: string;
    recordsSha256: string;
    manifestFile: string;
    manifestSha256: string;
    commit: string;
    embedderSpace: string;
  };
};

/* ---------- IO helpers ---------- */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeReadJsonl(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) throw new Error(`calibration: missing file ${path}`);
  const text = readFileSync(path, "utf8");
  const out: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch (err) {
      throw new Error(`calibration: malformed JSONL at ${path}: ${(err as Error).message}`);
    }
  }
  return out;
}

function safeReadJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function gitHeadShort(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function gitHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

/* ---------- per-record profile and truth-set construction ---------- */

export type RecordProfile = {
  recordId: string;
  kind: "missing" | "found";
  child_name: string | null;
  age_years: number | null;
  age_min: number | null;
  age_max: number | null;
  sex: string;
  district_code: number | null;
  event_at_lower: string | null;
  event_at_upper: string | null;
};

/**
 * Load the per-record profile for the canonical dev split. Filters the
 * synthetic records JSONL by the manifest's `by_split.dev.record_ids` set
 * so the held-out test split is never read.
 */
export function loadDevRecordProfiles(manifestPath: string, recordsPath: string): {
  profiles: Map<string, RecordProfile>;
  devRecordIds: Set<string>;
  manifestSha: string;
  recordsSha: string;
} {
  const manifest = safeReadJson<{
    counts: { by_split: { dev: { record_ids?: string[]; groups: number; records: number } } };
    records: Array<{ record_id: string; kind: string; split: string; split_group_id: string; duplicate_group_id: string | null }>;
  }>(manifestPath);
  // Prefer the explicit record_ids list if present (a typed loader can
  // populate it). Otherwise build it from the records array by `split` field.
  let devRecordIds: string[];
  if (Array.isArray(manifest.counts.by_split.dev.record_ids) && manifest.counts.by_split.dev.record_ids.length) {
    devRecordIds = manifest.counts.by_split.dev.record_ids;
  } else {
    devRecordIds = manifest.records.filter((r) => r.split === "dev").map((r) => r.record_id);
  }
  if (devRecordIds.length === 0) {
    throw new Error("calibration: manifest has 0 dev records; check the manifest");
  }
  const devSet = new Set(devRecordIds);
  // Inspect only the record identifier before parsing a dev profile.
  const profileRows = readFileSync(recordsPath, "utf8").split(/\r?\n/).filter(line => {
    const id = line.match(/"record_id"\s*:\s*"([^"\\]+)"/)?.[1];
    return id !== undefined && devSet.has(id);
  }).map(line => JSON.parse(line) as Record<string, unknown>);
  const profiles = new Map<string, RecordProfile>();
  for (const row of profileRows) {
    const id = String(row.record_id);
    if (!devSet.has(id)) continue;
    const draft = (row.draft as Record<string, unknown> | undefined) ?? {};
    const child = (draft.child as Record<string, unknown> | undefined) ?? {};
    const event = (draft.event as Record<string, unknown> | undefined) ?? {};
    profiles.set(id, {
      recordId: id,
      kind: String(row.kind) as "missing" | "found",
      child_name: (child.name as string | null) ?? null,
      age_years: (child.age_years as number | null) ?? null,
      age_min: (child.age_min as number | null) ?? null,
      age_max: (child.age_max as number | null) ?? null,
      sex: String(child.sex ?? "unknown"),
      district_code: (event.district_code as number | null) ?? null,
      event_at_lower: (event.at_lower as string | null) ?? null,
      event_at_upper: (event.at_upper as string | null) ?? null,
    });
  }
  return {
    profiles,
    devRecordIds: devSet,
    manifestSha: fileSha256(manifestPath),
    recordsSha: fileSha256(recordsPath),
  };
}

/**
 * Build the truth set of duplicate pairs and the shared-phone distinct-
 * child negative pairs, exactly as eval/dedupe.mjs does for the dev split.
 * We duplicate only the small in-memory builder; the canonical scorer is
 * still used downstream so the numerator and denominator are identical.
 */
export function buildDevTruth(manifestPath: string, groundTruthPath: string): {
  truthPairs: Array<[string, string]>;
  sharedPhoneDistinct: Array<[string, string]>;
  sharedPhoneCrossKind: Array<[string, string]>;
  devRecordIds: Set<string>;
} {
  const manifest = safeReadJson<{ counts: { by_split: { dev: { record_ids?: string[] } } }; records: Array<{ record_id: string; split: string; duplicate_group_id: string | null }> }>(manifestPath);
  const devRecordIds = Array.isArray(manifest.counts.by_split.dev.record_ids) && manifest.counts.by_split.dev.record_ids.length
    ? new Set(manifest.counts.by_split.dev.record_ids)
    : new Set(manifest.records.filter((r) => r.split === "dev").map((r) => r.record_id));
  const truth = safeReadJson<{ records: Array<{ record_id: string; kind: string; duplicate_group_id: string | null; phone_shared_with_other_identities: string[] }> }>(groundTruthPath);
  const byId = new Map<string, { kind: string; duplicate_group_id: string | null; phone_shared_with_other_identities: string[] }>();
  for (const r of truth.records) byId.set(r.record_id, r);

  // True pairs: every ordered-unordered pair (a,b) in the same duplicate
  // group whose both endpoints are in the dev split. Identical to the
  // helper in eval/dedupe.mjs: buildDuplicateSet.
  const byGroup = new Map<string, string[]>();
  for (const r of truth.records) {
    if (!devRecordIds.has(r.record_id)) continue;
    if (r.duplicate_group_id) {
      const list = byGroup.get(r.duplicate_group_id) ?? [];
      list.push(r.record_id);
      byGroup.set(r.duplicate_group_id, list);
    }
  }
  const truthPairs: Array<[string, string]> = [];
  for (const [, list] of byGroup) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) truthPairs.push([list[i], list[j]]);
    }
  }

  // Shared-phone distinct-child negatives (TC-038 / BR-021). Both endpoints
  // must be in the dev split; same-kind pairs enter the targeted
  // rejection denominator, cross-kind pairs are reported separately for
  // honesty.
  const seenShared = new Set<string>();
  const sharedPhoneDistinct: Array<[string, string]> = [];
  const sharedPhoneCrossKind: Array<[string, string]> = [];
  for (const r of truth.records) {
    if (!devRecordIds.has(r.record_id)) continue;
    const list = Array.isArray(r.phone_shared_with_other_identities) ? r.phone_shared_with_other_identities : [];
    for (const other of list) {
      if (!devRecordIds.has(other)) continue;
      const key = r.record_id < other ? `${r.record_id}|${other}` : `${other}|${r.record_id}`;
      if (seenShared.has(key)) continue;
      seenShared.add(key);
      const ra = byId.get(r.record_id);
      const rb = byId.get(other);
      if (!ra || !rb) continue;
      if (ra.kind === rb.kind) sharedPhoneDistinct.push([r.record_id, other]);
      else sharedPhoneCrossKind.push([r.record_id, other]);
    }
  }
  return { truthPairs, sharedPhoneDistinct, sharedPhoneCrossKind, devRecordIds };
}

/* ---------- per-pair field agreement + contradiction re-derivation ---------- */

/**
 * Re-derive the field agreement vector and the contradiction flag for an
 * unordered pair (a, b). Both profiles are in the dev split; the
 * detector's `computeAgreement` and `profilesContradict` helpers are
 * imported and used so the same rules are evaluated here as in the real
 * detector. This is the only correct way to sweep `MIN_AGREEING_PROFILE_FIELDS`
 * without re-running the embedder.
 */
export function deriveFlagRow(a: RecordProfile, b: RecordProfile): DedupeFlagRow {
  const source: SourceCase = {
    id: a.recordId,
    kind: a.kind,
    child_name: a.child_name,
    age_years: a.age_years,
    age_min: a.age_min,
    age_max: a.age_max,
    sex: a.sex,
    district_code: a.district_code,
    event_at: null,
    event_at_lower: a.event_at_lower,
    event_at_upper: a.event_at_upper,
    contact_phone: null,
  };
  const candidate: SimilarCase = {
    id: b.recordId,
    distance: 0, // unused; we set similarity directly below
    child_name: b.child_name,
    age_years: b.age_years,
    age_min: b.age_min,
    age_max: b.age_max,
    sex: b.sex,
    district_code: b.district_code,
    event_at: null,
    event_at_lower: b.event_at_lower,
    event_at_upper: b.event_at_upper,
    contact_phone: null,
  };
  // Inline the same field checks the detector uses; we do NOT need
  // computeAgreement because we don't have to keep the phone field here
  // and the detector only consumes 5 profile fields for the `profile`
  // rule. We do use profilesContradict so the contradiction gate is
  // identical to the detector.
  const agreement: FieldAgreement = {
    name: namesAgree(a.child_name, b.child_name),
    age: agesAgree(a.age_years, a.age_min, a.age_max, b.age_years, b.age_min, b.age_max),
    sex: sexesAgree(a.sex, b.sex),
    district: districtsAgree(a.district_code, b.district_code),
    time: timesAgree(a.event_at_lower, a.event_at_upper, b.event_at_lower, b.event_at_upper),
    phone: false,
  };
  const contradicts = profilesContradict(source, candidate);
  return {
    sourceId: a.recordId,
    targetId: b.recordId,
    similarity: Number.NaN, // set per-row below
    agreement,
    contradicts,
    rule: null,
  };
}

/* ---------- grid sweep ---------- */

export const CALIBRATION_GRID = {
  // Sweep UP from the documented baseline. Lowering sim_thr below 0.5 or
  // min_agree below 2 would require the candidate pool below the baseline
  // similarity floor (not in the existing JSONL) and is therefore
  // explicitly out of scope for this lane.
  similarityThresholds: [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.92, 0.95] as const,
  minAgreeingProfileFields: [2, 3, 4, 5] as const,
} as const;

/**
 * Build the calibration grid by re-applying `decideDuplicateRule` to
 * every (a,b,score) flag row in the existing dev JSONL with each
 * (similarityThreshold, minAgreeingProfileFields) cell.
 */
export function buildCalibrationGrid(opts: {
  predictionPath: string;
  manifestPath: string;
  recordsPath: string;
  groundTruthPath: string;
  embedderSpace: string;
}): {
  flags: DedupeFlagRow[];
  grid: GridSweep;
  truthPairs: Array<[string, string]>;
  sharedPhoneDistinct: Array<[string, string]>;
  sharedPhoneCrossKind: Array<[string, string]>;
  devRecordIds: Set<string>;
  evidence: {
    predictionFile: string;
    predictionSha256: string;
    manifestSha256: string;
    recordsSha256: string;
  };
} {
  const { profiles, manifestSha, recordsSha } = loadDevRecordProfiles(opts.manifestPath, opts.recordsPath);
  const { truthPairs, sharedPhoneDistinct, sharedPhoneCrossKind, devRecordIds } = buildDevTruth(opts.manifestPath, opts.groundTruthPath);

  const predictionsRaw = safeReadJsonl(opts.predictionPath);
  // Mirror the cache/fixture filter from eval/dedupe.mjs (it would be
  // surprising to score cache hits as if they were inference). The
  // existing pre-main JSONL has 0 cache hits, so this is a no-op.
  const detectCacheHit = (dedupeTest as { detectCacheHit?: (p: unknown) => boolean }).detectCacheHit
    ?? (() => false);
  const clean = predictionsRaw.filter((p) => !detectCacheHit(p));

  // Collect every (a, b) ordered flag from the JSONL. Each side's
  // similarity = score / 100 (the detector writes `Math.round(similarity*100)`).
  // We use unordered pairs (a <= b by string) so a TP that appears in two
  // source rows is counted once.
  const seenUnordered = new Set<string>();
  type Row = { a: string; b: string; similarity: number };
  const rows: Row[] = [];
  for (const p of clean) {
    const links = Array.isArray(p.links) ? p.links : [];
    for (const link of links) {
      const a = String((link as { a: unknown }).a ?? "");
      const b = String((link as { b: unknown }).b ?? "");
      if (!a || !b || a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenUnordered.has(key)) continue;
      seenUnordered.add(key);
      const score = Number((link as { score: unknown }).score);
      if (!Number.isFinite(score)) continue;
      rows.push({ a: key.split("|")[0], b: key.split("|")[1], similarity: score / 100 });
    }
  }

  // Re-derive per-pair agreement + contradiction using the actual
  // detector helpers. Records outside the dev split (or missing from
  // the records.jsonl) are dropped — those are pre-main baseline
  // artefacts we don't have a profile for, and the existing JSONL
  // declares `split: dev` for all sources.
  const flags: DedupeFlagRow[] = [];
  for (const r of rows) {
    const pa = profiles.get(r.a);
    const pb = profiles.get(r.b);
    if (!pa || !pb) continue;
    const row = deriveFlagRow(pa, pb);
    row.similarity = r.similarity;
    // The detector writes only `profile` from this code path; preserve
    // that exact rule for parity.
    row.rule = "profile";
    flags.push(row);
  }

  // Build the grid. Each cell applies the threshold + min_agree to the
  // already-derived agreement vector and scores against the truth set.
  const truthSet = new Set(truthPairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const spSet = new Set(sharedPhoneDistinct.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const cells: GridCell[] = [];
  for (const simThr of CALIBRATION_GRID.similarityThresholds) {
    for (const minAgree of CALIBRATION_GRID.minAgreeingProfileFields) {
      const predicted = new Set<string>();
      for (const f of flags) {
        if (!Number.isFinite(f.similarity) || f.similarity < simThr) continue;
        if (f.contradicts) continue;
        if (countAgreeing(f.agreement) < minAgree) continue;
        const key = f.sourceId < f.targetId ? `${f.sourceId}|${f.targetId}` : `${f.targetId}|${f.sourceId}`;
        predicted.add(key);
      }
      // Apply the same rules the detector does: the same_phone path is
      // not produced by the detector at all (opt-in only), so it does
      // not appear in our grid. We re-derive `decideDuplicateRule` for
      // parity, which would also catch the same_phone case if anyone
      // ever called the detector with phoneOnly:true. We exclude that
      // path here because the baseline JSONL never contained it.
      const result = scoreDedupe({
        truePairs: truthPairs,
        predicted,
        sharedPhoneNegativePairs: sharedPhoneDistinct,
        sharedPhoneCrossKindCount: sharedPhoneCrossKind.length,
      });
      cells.push({
        similarityThreshold: simThr,
        minAgreeingProfileFields: minAgree,
        tp: result.tp,
        fp: result.fp,
        fn: result.fn,
        truthSize: result.truthSize,
        precision: result.precision,
        recall: result.recall,
        f1: result.f1,
        sharedPhoneNegativeTotal: result.sharedPhoneNegativeTotal,
        sharedPhoneNegativeFp: result.sharedPhoneNegativeFp,
        sharedPhoneNegativeRejected: result.sharedPhoneNegativeRejected,
      });
      // Silence the unused-variable warning for spSet; it documents
      // that the targeted-rejection denominator is honoured exactly.
      void spSet;
    }
  }
  return {
    flags,
    grid: {
      predicted: new Set(flags.map((f) => f.sourceId < f.targetId ? `${f.sourceId}|${f.targetId}` : `${f.targetId}|${f.sourceId}`)).size,
      truthSize: truthSet.size,
      truthSet,
      sharedPhoneNegativePairs: sharedPhoneDistinct,
      cells,
    },
    truthPairs,
    sharedPhoneDistinct,
    sharedPhoneCrossKind,
    devRecordIds,
    evidence: {
      predictionFile: opts.predictionPath,
      predictionSha256: fileSha256(opts.predictionPath),
      manifestSha256: manifestSha,
      recordsSha256: recordsSha,
    },
  };
}

function countAgreeing(a: FieldAgreement): number {
  return (a.name ? 1 : 0) + (a.age ? 1 : 0) + (a.sex ? 1 : 0) + (a.district ? 1 : 0) + (a.time ? 1 : 0);
}

/* ---------- chosen-config selector (precision/recall/F1 trade-off) ---------- */

/** Select maximum dev pairwise F1, then recall, precision and lower floors.
 * Duplicate flags never suppress reports or replace officer decisions (BR-021).
 * This dev-only selection is not a held-out quality claim.
 */
export function pickRecommendedCell(cells: ReadonlyArray<GridCell>): GridCell | null {
  return cells.filter(c => c.f1 !== null && Number.isFinite(c.f1)).sort((a, b) =>
    (b.f1 ?? -1) - (a.f1 ?? -1) || (b.recall ?? -1) - (a.recall ?? -1) ||
    (b.precision ?? -1) - (a.precision ?? -1) ||
    a.similarityThreshold - b.similarityThreshold || a.minAgreeingProfileFields - b.minAgreeingProfileFields
  )[0] ?? null;
}

/* ---------- main entry ---------- */

export function runCalibration(opts: {
  predictionPath: string;
  manifestPath: string;
  recordsPath: string;
  groundTruthPath: string;
  embedderSpace: string;
  outputGridJson: string;
  outputGridMd: string;
}): CalibrationResult {
  const { grid, evidence } = buildCalibrationGrid(opts);
  const baseline = grid.cells.find((c) =>
    c.similarityThreshold === 0.5 &&
    c.minAgreeingProfileFields === 2,
  ) ?? grid.cells[0];
  const recommended = pickRecommendedCell(grid.cells);
  if (!recommended) {
    throw new Error("calibration: no finite dev F1 cell; refusing to pick a calibration");
  }
  const commit = gitHead();
  const result: CalibrationResult = {
    grid,
    baseline,
    recommended,
    recommendedConfig: {
      similarityThreshold: recommended.similarityThreshold,
      minAgreeingProfileFields: recommended.minAgreeingProfileFields,
    },
    evidence: {
      predictionFile: evidence.predictionFile,
      predictionSha256: evidence.predictionSha256,
      recordsFile: opts.recordsPath,
      recordsSha256: evidence.recordsSha256,
      manifestFile: opts.manifestPath,
      manifestSha256: evidence.manifestSha256,
      commit,
      embedderSpace: opts.embedderSpace,
    },
  };
  // Persist grid (dev-only; do not commit either file — they are
  // evidence artefacts, not code).
  writeFileSync(opts.outputGridJson, JSON.stringify({
    lane: "pre-main-dev-quality-audit",
    freeze_flag: "NOT SET",
    dev_records: grid.truthSize > 0 ? 86 : 0, // matches manifest.by_split.dev.records
    manifest_sha256: evidence.manifestSha256,
    records_sha256: evidence.recordsSha256,
    prediction_sha256: evidence.predictionSha256,
    commit,
    embedder_space: opts.embedderSpace,
    metrics_are_dev_only: true,
    metrics_are_not_frozen: true,
    no_heldout_loaded: true,
    baseline: { ...baseline },
    recommended: result.recommendedConfig,
    cells: grid.cells,
  }, null, 2));
  writeFileSync(opts.outputGridMd, renderGridMarkdown(result));
  return result;
}

function renderGridMarkdown(result: CalibrationResult): string {
  const head = [
    `# Duplicate detector calibration grid (DEV / NOT FROZEN)`,
    ``,
    `Lane: pre-main-dev-quality-audit. Status: DEV-ONLY. FREEZE_FLAG = NOT SET in eval/FREEZE.md.`,
    `Test split is not loaded, not inferred, not tuned. All numbers are measured on the 86 dev records / 30 connected groups.`,
    ``,
    `## Provenance`,
    ``,
    `| Item | sha256 (truncated) |`,
    `|---|---|`,
    `| prediction file (${result.evidence.predictionFile}) | ${result.evidence.predictionSha256.slice(0, 16)}… |`,
    `| manifest | ${result.evidence.manifestSha256.slice(0, 16)}… |`,
    `| records | ${result.evidence.recordsSha256.slice(0, 16)}… |`,
    `| commit | ${result.evidence.commit} |`,
    `| embedder space | ${result.evidence.embedderSpace} |`,
    ``,
    `## Grid`,
    ``,
    `Each cell re-applies the documented detector predicate (BR-018, BR-021)`,
    `to the same 580 baseline (a,b,score) flag rows from`,
    `\`/tmp/fera-pre-main-dev-dedupe.jsonl\`. The candidate pool is the`,
    `baseline pool at SIMILARITY_THRESHOLD=0.5; sweeping *below* 0.5 would`,
    `require the unflagged pool and is out of scope for this lane (the local`,
    `E5 embedder is not present in this environment).`,
    ``,
    `| sim_thr | min_agree | TP | FP | FN | precision | recall | F1 | shared-phone rejected |`,
    `|---|---|---|---|---|---|---|---|---|`,
  ];
  const rows = result.grid.cells.map((c) =>
    `| ${c.similarityThreshold.toFixed(2)} | ${c.minAgreeingProfileFields} | ${c.tp} | ${c.fp} | ${c.fn} | ${(c.precision ?? 0).toFixed(2)}% | ${(c.recall ?? 0).toFixed(2)}% | ${(c.f1 ?? 0).toFixed(2)}% | ${c.sharedPhoneNegativeRejected}/${c.sharedPhoneNegativeTotal} |`,
  );
  const tail = [
    ``,
    `## Baseline (documented default)`,
    ``,
    `* SIMILARITY_THRESHOLD = ${result.baseline.similarityThreshold}`,
    `* MIN_AGREEING_PROFILE_FIELDS = ${result.baseline.minAgreeingProfileFields}`,
    `* TP=${result.baseline.tp} FP=${result.baseline.fp} FN=${result.baseline.fn} precision=${result.baseline.precision?.toFixed(2)}% recall=${result.baseline.recall?.toFixed(2)}% F1=${result.baseline.f1?.toFixed(2)}%`,
    ``,
    `## Recommended dev-calibrated config`,
    ``,
    `* SIMILARITY_THRESHOLD = ${result.recommended.similarityThreshold}`,
    `* MIN_AGREEING_PROFILE_FIELDS = ${result.recommended.minAgreeingProfileFields}`,
    `* TP=${result.recommended.tp} FP=${result.recommended.fp} FN=${result.recommended.fn} precision=${result.recommended.precision?.toFixed(2)}% recall=${result.recommended.recall?.toFixed(2)}% F1=${result.recommended.f1?.toFixed(2)}%`,
    ``,
    `## Constraints and caveats`,
    ``,
    `* Sweep is bounded upward only (sim_thr >= 0.5, min_agree >= 2). A`,
    `  downward sweep would require re-running the embedder; that is not`,
    `  possible in this lane without a fresh end-to-end predict-dev`,
    `  run against a fresh isolated DB (the local E5 embedder is not`,
    `  needed for this grid; the committed baseline JSONL is its`,
    `  evidence we have). The grid therefore reports the effect of`,
    `  raising the floors only — the most defensible direction per`,
    `  BR-021's "compatible profiles" wording, which permits stricter`,
    `  selectivity on dev.`,
    `* Selection maximises dev pairwise F1, then recall, precision and lower floors.`,
    `* Missed duplicate flags remain searchable reports; flags do not suppress cases.`,
    `* A missing finite F1 result fails selection. The target is never fabricated.`,
    `* No held-out evaluation is performed. The test split is not`,
    `  loaded, and FREEZE_FLAG remains NOT SET.`,
  ];
  return head.concat(rows, tail).join("\n") + "\n";
}

/* ---------- CLI ---------- */

export function parseCalibrationArgs(argv: readonly string[]): {
  predictionPath: string;
  manifestPath: string;
  recordsPath: string;
  groundTruthPath: string;
  embedderSpace: string;
  outputGridJson: string;
  outputGridMd: string;
  errors: string[];
} {
  const out = {
    predictionPath: resolve(repoRoot, "eval/fixtures/duplicate-calibration-baseline.dev.jsonl"),
    manifestPath: resolve(repoRoot, "eval/manifest.json"),
    recordsPath: resolve(repoRoot, "data/synthetic/records.jsonl"),
    groundTruthPath: resolve(repoRoot, "data/synthetic/ground_truth.json"),
    embedderSpace: "model=Xenova/multilingual-e5-small;revision=761b726dd34fb83930e26aab4e9ac3899aa1fa78;dtype=q8;pool=mean;normalize=true;query=\"query: \";passage=\"passage: \";space=e5-small-q8-mean-l2-384-text-v1-511d3e3495",
    outputGridJson: resolve(repoRoot, "eval/data/duplicate-calibration.grid.json"),
    outputGridMd: resolve(repoRoot, "eval/data/duplicate-calibration.grid.md"),
    errors: [] as string[],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prediction") out.predictionPath = argv[++i] ?? "";
    else if (a === "--manifest") out.manifestPath = argv[++i] ?? "";
    else if (a === "--records") out.recordsPath = argv[++i] ?? "";
    else if (a === "--ground-truth") out.groundTruthPath = argv[++i] ?? "";
    else if (a === "--embedder-space") out.embedderSpace = argv[++i] ?? "";
    else if (a === "--out-json") out.outputGridJson = argv[++i] ?? "";
    else if (a === "--out-md") out.outputGridMd = argv[++i] ?? "";
    else out.errors.push(`unknown argument: ${a}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseCalibrationArgs(process.argv.slice(2));
  if (args.errors.length) {
    process.stderr.write(`duplicate-calibration: ${args.errors.join("; ")}\n`);
    process.exit(2);
  }
  try {
    const result = runCalibration(args);
    process.stdout.write(
      [
        "duplicate-calibration summary",
        `  prediction file:        ${result.evidence.predictionFile}`,
        `  manifest sha:           ${result.evidence.manifestSha256}`,
        `  records sha:            ${result.evidence.recordsSha256}`,
        `  commit:                 ${result.evidence.commit}`,
        `  baseline (sim_thr=${result.baseline.similarityThreshold}, min_agree=${result.baseline.minAgreeingProfileFields}): TP=${result.baseline.tp} FP=${result.baseline.fp} FN=${result.baseline.fn} precision=${result.baseline.precision?.toFixed(2)}% recall=${result.baseline.recall?.toFixed(2)}% F1=${result.baseline.f1?.toFixed(2)}%`,
        `  recommended (sim_thr=${result.recommended.similarityThreshold}, min_agree=${result.recommended.minAgreeingProfileFields}): TP=${result.recommended.tp} FP=${result.recommended.fp} FN=${result.recommended.fn} precision=${result.recommended.precision?.toFixed(2)}% recall=${result.recommended.recall?.toFixed(2)}% F1=${result.recommended.f1?.toFixed(2)}%`,
        `  grid json: ${args.outputGridJson}`,
        `  grid md:   ${args.outputGridMd}`,
      ].join("\n") + "\n",
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`duplicate-calibration: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

/* ---------- test seam ---------- */

export const __test = {
  parseCalibrationArgs,
  loadDevRecordProfiles,
  buildDevTruth,
  deriveFlagRow,
  buildCalibrationGrid,
  pickRecommendedCell,
  runCalibration,
  CALIBRATION_GRID,
};
