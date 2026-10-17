// TASK-064: identity-grouped dev/test manifest. Pure functions; no I/O except the two default readers.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_REVISION = "man-1";
export const MANIFEST_SEED = 6401; // arbitrary fixed constant; changing it changes the split
export const DEV_TARGET_RATIO = 0.4; // intent only: groups are never broken to hit it
export const EXPECTED = { total: 200, missing_canonical: 80, found_canonical: 80, decoys: 40, true_pairs: 60, no_match_queries: 20, duplicate_links: 25 };
const here = dirname(fileURLToPath(import.meta.url));
export const paths = {
  groundTruth: join(here, "..", "data", "synthetic", "ground_truth.json"),
  records: join(here, "..", "data", "synthetic", "records.jsonl"),
  manifest: join(here, "manifest.json"),
  hash: join(here, "manifest.sha256"),
  freeze: join(here, "FREEZE.md"),
};
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const distinct = (xs) => new Set(xs).size;

export function computeCounts(rows) {
  const by = (split) => rows.filter((r) => r.split === split);
  const per = (f) => ({ dev: f(by("dev")), test: f(by("test")) });
  const nonDecoy = (r) => r.role !== "decoy";
  return {
    total: rows.length,
    missing_canonical: rows.filter((r) => r.kind === "missing" && nonDecoy(r)).length,
    found_canonical: rows.filter((r) => r.kind === "found" && nonDecoy(r)).length,
    decoys: rows.filter((r) => r.role === "decoy").length,
    true_pairs: distinct(rows.filter((r) => r.role === "pair_query").map((r) => r.identity_id)),
    no_match_queries: rows.filter((r) => r.kind === "missing" && r.no_match && nonDecoy(r)).length,
    duplicate_links: distinct(rows.filter((r) => r.duplicate_group_id).map((r) => r.duplicate_group_id)),
    records: per((x) => x.length),
    split_groups: per((x) => distinct(x.map((r) => r.split_group_id))),
    identities: per((x) => distinct(x.map((r) => r.identity_id))),
    no_match_identities_by_split: per((x) => distinct(x.filter((r) => r.no_match && nonDecoy(r)).map((r) => r.identity_id))),
    no_match_queries_by_split: per((x) => x.filter((r) => r.kind === "missing" && r.no_match && nonDecoy(r)).length),
    demo_role_records_by_split: per((x) => x.filter((r) => r.demo_role).length),
    duplicate_groups_by_split: per((x) => distinct(x.filter((r) => r.duplicate_group_id).map((r) => r.duplicate_group_id))),
    true_pairs_by_split: per((x) => distinct(x.filter((r) => r.role === "pair_query").map((r) => r.identity_id))),
    decoys_by_split: per((x) => x.filter((r) => r.role === "decoy").length),
    dev_target_records: Math.round(rows.length * DEV_TARGET_RATIO),
  };
}

export function buildManifest(groundTruth) {
  const gt = groundTruth.records;
  const groups = new Map();
  for (const r of gt) {
    const g = groups.get(r.split_group_id) ?? { id: r.split_group_id, n: 0, demo: false };
    g.n += 1;
    if (r.demo_role) g.demo = true;
    groups.set(r.split_group_id, g);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const target = Math.round(gt.length * DEV_TARGET_RATIO);
  const split = new Map();
  let dev = 0;
  // Demo-role groups go to dev so demo tuning never touches the held-out test set.
  for (const g of ordered.filter((x) => x.demo)) { split.set(g.id, "dev"); dev += g.n; }
  const rand = mulberry32(MANIFEST_SEED);
  const rest = ordered.filter((x) => !x.demo);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  for (const g of rest) {
    if (dev + g.n <= target) { split.set(g.id, "dev"); dev += g.n; } else split.set(g.id, "test");
  }
  const rows = gt
    .map((r) => ({
      record_id: r.record_id,
      kind: r.kind,
      role: r.role,
      identity_id: r.identity_id,
      duplicate_group_id: r.duplicate_group_id,
      split_group_id: r.split_group_id,
      true_partner_ids: r.true_partner_ids,
      no_match: r.no_match,
      decoy_type: r.decoy_type,
      decoy_target_ids: r.decoy_target_ids,
      source_variant: r.source_variant,
      demo_role: r.demo_role,
      split: split.get(r.split_group_id),
      speaker_id: r.speaker_id,
      ground_truth_revision: r.ground_truth_revision,
    }))
    .sort((a, b) => (a.record_id < b.record_id ? -1 : 1));
  return {
    manifest_revision: MANIFEST_REVISION,
    seed: MANIFEST_SEED,
    synthetic: true,
    generator_revision: groundTruth.generator_revision,
    ground_truth_revision: groundTruth.ground_truth_revision,
    inputs: { ground_truth_json_sha256: sha256(readFileSync(paths.groundTruth)), records_jsonl_sha256: sha256(readFileSync(paths.records)) },
    assignment: "whole split_group_id to dev or test; demo-role groups forced to dev; remaining groups in seeded shuffle order fill dev up to the 40% record target, the rest go to test",
    counts: computeCounts(rows),
    records: rows,
  };
}

export const serializeManifest = (m) => JSON.stringify(m, null, 2) + "\n";

const FIELDS = ["record_id", "kind", "role", "identity_id", "duplicate_group_id", "split_group_id", "true_partner_ids", "no_match", "decoy_type", "decoy_target_ids", "source_variant", "demo_role", "speaker_id", "ground_truth_revision"];

/** Throws on any inconsistency. opts.sha256 (when given) must equal the hash of the serialised manifest. */
export function assertManifest(manifest, groundTruth, opts = {}) {
  const rows = manifest.records;
  const gt = groundTruth.records;
  const fail = (m) => { throw new Error(`manifest: ${m}`); };
  if (rows.length !== EXPECTED.total) fail(`expected ${EXPECTED.total} records, found ${rows.length}`);
  if (opts.sha256 !== undefined && sha256(serializeManifest(manifest)) !== opts.sha256) fail("hash differs from the committed hash");
  const truth = new Map(gt.map((r) => [r.record_id, r]));
  for (const r of rows) {
    const t = truth.get(r.record_id);
    if (!t) fail(`unknown record ${r.record_id}`);
    for (const f of FIELDS) if (JSON.stringify(r[f]) !== JSON.stringify(t[f])) fail(`field ${f} differs from ground truth for ${r.record_id}`);
    if (r.split !== "dev" && r.split !== "test") fail(`bad split on ${r.record_id}`);
    if (r.split_group_id !== t.split_group_id) fail(`split_group_id changed for ${r.record_id}`);
  }
  if (new Set(rows.map((r) => r.record_id)).size !== EXPECTED.total) fail("duplicate record_id");
  for (const key of ["split_group_id", "identity_id"]) {
    const seen = new Map();
    for (const r of rows) {
      const s = seen.get(r[key]) ?? new Set();
      s.add(r.split);
      seen.set(r[key], s);
    }
    for (const [k, s] of seen) if (s.size > 1) fail(`${key} ${k} spans both dev and test`);
  }
  const c = computeCounts(rows);
  for (const k of Object.keys(EXPECTED)) if (c[k] !== EXPECTED[k]) fail(`count ${k} is ${c[k]}, expected ${EXPECTED[k]}`);
  if (JSON.stringify(manifest.counts) !== JSON.stringify(c)) fail("counts block does not match the rows");
  return c;
}

function heldOutCheck(manifest, freezeText, expectedHash) {
  if (!/^FREEZE_FLAG: SET\s*$/m.test(freezeText)) throw new Error("held-out evaluation refused: freeze flag is not set in eval/FREEZE.md");
  if (sha256(serializeManifest(manifest)) !== expectedHash) throw new Error("held-out evaluation refused: manifest hash differs from the committed hash");
}

/** The held-out test split may only be used after FREEZE.md carries `FREEZE_FLAG: SET` (it does not yet). */
export function assertHeldOutAllowed(manifest) {
  heldOutCheck(manifest, readFileSync(paths.freeze, "utf8"), readFileSync(paths.hash, "utf8").trim().split(/\s+/)[0]);
}

/** Test-only: same check with injected freeze text and hash. Production code must not import this. */
export function __testOnly_heldOutCheck(manifest, freezeText, expectedHash) {
  heldOutCheck(manifest, freezeText, expectedHash);
}

/**
 * The ONLY accessor for the rows of a split. Eval code (including TASK-039) must go through it.
 * "test" is the held-out split and throws until the freeze flag is set.
 */
export function loadSplit(manifest, split) {
  if (split !== "dev" && split !== "test") throw new Error(`unknown split: ${split}`);
  if (split === "test") assertHeldOutAllowed(manifest);
  return manifest.records.filter((r) => r.split === split);
}
