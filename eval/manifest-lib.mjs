// TASK-064: canonical identity-grouped dev/test manifest and held-out guard.
// The split preserves the existing 2020 seeded assignment from the synthetic-set manifest.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_REVISION = "manifest-2";
export const MANIFEST_SEED = 2020;
export const DEV_FRACTION = 0.4;
const ASSIGNMENT_POLICY = "whole connected identity/duplicate/partner/decoy-target groups assigned by seeded shuffle; 40% of groups to dev, remainder to test";
export const EXPECTED = {
  total: 200,
  missing_canonical: 80,
  found_canonical: 80,
  decoys: 40,
  true_pairs: 60,
  no_match_queries: 20,
  duplicate_links: 25,
  shared_phone_decoys: 7,
  groups: 75,
};

const here = dirname(fileURLToPath(import.meta.url));
export const paths = {
  groundTruth: join(here, "..", "data", "synthetic", "ground_truth.json"),
  records: join(here, "..", "data", "synthetic", "records.jsonl"),
  manifest: join(here, "manifest.json"),
  hash: join(here, "manifest.sha256"),
  freeze: join(here, "FREEZE.md"),
};

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

function readSourceFiles() {
  return {
    groundTruthBytes: readFileSync(paths.groundTruth),
    recordsBytes: readFileSync(paths.records),
  };
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function connectedGroups(records) {
  const parent = new Map(records.map((record) => [record.record_id, record.record_id]));
  const find = (id) => {
    if (!parent.has(id)) throw new Error(`manifest: relationship references unknown record ${id}`);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  };
  const byIdentity = new Map();
  const byDuplicate = new Map();
  for (const record of records) {
    const sameIdentity = byIdentity.get(record.identity_id);
    if (sameIdentity) union(record.record_id, sameIdentity);
    else byIdentity.set(record.identity_id, record.record_id);
    if (record.duplicate_group_id) {
      const sameDuplicate = byDuplicate.get(record.duplicate_group_id);
      if (sameDuplicate) union(record.record_id, sameDuplicate);
      else byDuplicate.set(record.duplicate_group_id, record.record_id);
    }
    for (const partner of record.true_partner_ids) union(record.record_id, partner);
    for (const target of record.decoy_target_ids) union(record.record_id, target);
  }

  const grouped = new Map();
  for (const record of records) {
    const root = find(record.record_id);
    const members = grouped.get(root) ?? [];
    members.push(record.record_id);
    grouped.set(root, members);
  }
  return new Map([...grouped.values()].map((members) => {
    members.sort();
    return [members[0], members];
  }));
}

function assignGroups(groups) {
  // Keep the original assignment: sort by each component's smallest UUID, then shuffle with seed 2020.
  const shuffled = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const random = mulberry32(MANIFEST_SEED);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const devGroupCount = Math.round(shuffled.length * DEV_FRACTION);
  const splitByRecord = new Map();
  for (let index = 0; index < shuffled.length; index++) {
    const split = index < devGroupCount ? "dev" : "test";
    for (const recordId of shuffled[index][1]) splitByRecord.set(recordId, split);
  }
  return splitByRecord;
}

function countRows(rows, selectedSplit) {
  const selected = rows.filter((row) => row.split === selectedSplit);
  const groups = new Set(selected.map((row) => row.split_group_id));
  const truePairs = new Set(selected.filter((row) => row.role === "pair_query").map((row) => row.identity_id));
  const duplicates = new Set(selected.map((row) => row.duplicate_group_id).filter(Boolean));
  return {
    groups: groups.size,
    records: selected.length,
    true_pairs: truePairs.size,
    no_match_queries: selected.filter((row) => row.kind === "missing" && row.no_match).length,
    duplicate_links: duplicates.size,
    shared_phone_decoys: selected.filter((row) => row.decoy_type === "shared_phone").length,
    decoys: selected.filter((row) => row.role === "decoy").length,
  };
}

function countComposition(rows) {
  const canonical = rows.filter((row) => row.role !== "decoy");
  return {
    total: rows.length,
    missing_canonical: canonical.filter((row) => row.kind === "missing").length,
    found_canonical: canonical.filter((row) => row.kind === "found").length,
    decoys: rows.filter((row) => row.role === "decoy").length,
    true_pairs: new Set(rows.filter((row) => row.role === "pair_query").map((row) => row.identity_id)).size,
    no_match_queries: rows.filter((row) => row.kind === "missing" && row.no_match).length,
    duplicate_links: new Set(rows.map((row) => row.duplicate_group_id).filter(Boolean)).size,
    shared_phone_decoys: rows.filter((row) => row.decoy_type === "shared_phone").length,
    groups: new Set(rows.map((row) => row.split_group_id)).size,
  };
}

function makeRows(groundTruth, splitByRecord) {
  return groundTruth.records.map((record) => ({
    record_id: record.record_id,
    kind: record.kind,
    role: record.role,
    identity_id: record.identity_id,
    duplicate_group_id: record.duplicate_group_id,
    split_group_id: record.split_group_id,
    true_partner_ids: record.true_partner_ids,
    no_match: record.no_match,
    decoy_type: record.decoy_type,
    decoy_target_ids: record.decoy_target_ids,
    source_variant: record.source_variant,
    demo_role: record.demo_role,
    split: splitByRecord.get(record.record_id),
    speaker_id: record.speaker_id ?? null,
    ground_truth_revision: record.ground_truth_revision,
  })).sort((a, b) => a.record_id.localeCompare(b.record_id));
}

export function buildManifest(groundTruth, options = {}) {
  if (!Array.isArray(groundTruth?.records)) throw new Error("manifest: ground truth records are missing");
  const { groundTruthBytes, recordsBytes } = { ...readSourceFiles(), ...options };
  const groups = connectedGroups(groundTruth.records);
  const splitByRecord = assignGroups(groups);
  const rows = makeRows(groundTruth, splitByRecord);
  const inputHashes = {
    ground_truth_sha256: sha256(groundTruthBytes),
    records_sha256: sha256(recordsBytes),
  };
  return {
    manifest_revision: MANIFEST_REVISION,
    seed: MANIFEST_SEED,
    synthetic: true,
    generator_revision: groundTruth.generator_revision,
    ground_truth_revision: groundTruth.ground_truth_revision,
    dev_fraction: DEV_FRACTION,
    inputs: inputHashes,
    assignment: ASSIGNMENT_POLICY,
    counts: {
      ...countComposition(rows),
      by_split: {
        dev: countRows(rows, "dev"),
        test: countRows(rows, "test"),
      },
    },
    records: rows,
  };
}

const RECORD_FIELDS = [
  "record_id", "kind", "role", "identity_id", "duplicate_group_id", "split_group_id",
  "true_partner_ids", "no_match", "decoy_type", "decoy_target_ids", "source_variant",
  "demo_role", "speaker_id", "ground_truth_revision",
];

const fail = (message) => { throw new Error(`manifest: ${message}`); };

function readCommittedHash() {
  const value = readFileSync(paths.hash, "utf8").trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(value)) fail("committed manifest hash is malformed");
  return value;
}

function verifySourceHashes(manifest, options = {}) {
  const { groundTruthBytes, recordsBytes } = { ...readSourceFiles(), ...options };
  const expected = {
    ground_truth_sha256: sha256(groundTruthBytes),
    records_sha256: sha256(recordsBytes),
  };
  if (JSON.stringify(manifest.inputs) !== JSON.stringify(expected)) fail("input hashes differ from the committed synthetic data");
}

function expectedSplitByRecord(groundTruth) {
  return assignGroups(connectedGroups(groundTruth.records));
}

export function assertManifest(manifest, groundTruth, options = {}) {
  const rows = manifest?.records;
  if (!Array.isArray(rows)) fail("records are missing");
  if (rows.length !== EXPECTED.total) fail(`expected ${EXPECTED.total} records, found ${rows.length}`);
  if (!Array.isArray(groundTruth?.records) || groundTruth.records.length !== EXPECTED.total) fail("ground truth record count differs from the expected synthetic set");
  if (manifest.manifest_revision !== MANIFEST_REVISION) fail("manifest revision differs");
  if (manifest.seed !== MANIFEST_SEED || manifest.dev_fraction !== DEV_FRACTION) fail("split seed or target fraction differs");
  if (manifest.synthetic !== true) fail("manifest is not marked synthetic");
  if (manifest.generator_revision !== groundTruth.generator_revision || manifest.ground_truth_revision !== groundTruth.ground_truth_revision) fail("source revisions differ from ground truth");
  if (manifest.assignment !== ASSIGNMENT_POLICY) fail("split assignment policy differs");
  if (options.sha256 !== undefined && sha256(serializeManifest(manifest)) !== options.sha256) fail("hash differs from the committed hash");
  verifySourceHashes(manifest, options);

  const truthById = new Map(groundTruth.records.map((row) => [row.record_id, row]));
  const rowById = new Map();
  for (const row of rows) {
    const truth = truthById.get(row.record_id);
    if (!truth) fail(`unknown record ${row.record_id}`);
    if (rowById.has(row.record_id)) fail(`duplicate record_id ${row.record_id}`);
    rowById.set(row.record_id, row);
    for (const field of RECORD_FIELDS) {
      if (JSON.stringify(row[field]) !== JSON.stringify(field === "speaker_id" ? truth[field] ?? null : truth[field])) {
        fail(`field ${field} differs from ground truth for ${row.record_id}`);
      }
    }
    if (row.split !== "dev" && row.split !== "test") fail(`bad split on ${row.record_id}`);
  }
  if (rowById.size !== truthById.size) fail("manifest omits a ground truth record");

  const expectedSplit = expectedSplitByRecord(groundTruth);
  const splitForGroup = new Map();
  const splitForIdentity = new Map();
  const splitForDuplicate = new Map();
  for (const row of rows) {
    for (const [field, map] of [["split_group_id", splitForGroup], ["identity_id", splitForIdentity]] ) {
      const key = row[field];
      const previous = map.get(key);
      if (previous && previous !== row.split) fail(`${field} ${key} spans dev and test`);
      map.set(key, row.split);
    }
    if (row.duplicate_group_id) {
      const previous = splitForDuplicate.get(row.duplicate_group_id);
      if (previous && previous !== row.split) fail(`duplicate_group_id ${row.duplicate_group_id} spans dev and test`);
      splitForDuplicate.set(row.duplicate_group_id, row.split);
    }
    for (const relatedId of [...row.true_partner_ids, ...row.decoy_target_ids]) {
      const related = rowById.get(relatedId);
      if (!related) fail(`relationship from ${row.record_id} references unknown record ${relatedId}`);
      if (related.split !== row.split) fail(`connected records ${row.record_id} and ${relatedId} span dev and test`);
    }
  }
  for (const row of rows) {
    if (row.split !== expectedSplit.get(row.record_id)) fail(`seeded split differs for ${row.record_id}`);
  }

  const composition = countComposition(rows);
  for (const key of Object.keys(EXPECTED)) {
    if (composition[key] !== EXPECTED[key]) fail(`count ${key} is ${composition[key]}, expected ${EXPECTED[key]}`);
  }
  const counts = {
    ...composition,
    by_split: { dev: countRows(rows, "dev"), test: countRows(rows, "test") },
  };
  if (JSON.stringify(manifest.counts) !== JSON.stringify(counts)) fail("counts block does not match the manifest rows");
  if (counts.by_split.dev.groups !== Math.round(counts.groups * DEV_FRACTION)) fail("dev/test group ratio differs from the declared 40/60 target");
  if (counts.by_split.dev.groups + counts.by_split.test.groups !== counts.groups) fail("dev/test group counts do not sum to the total");
  return counts;
}

function assertHeldOutContentHash(manifest, expectedHash) {
  if (!expectedHash || sha256(serializeManifest(manifest)) !== expectedHash) {
    fail("held-out evaluation refused: manifest hash differs from the committed hash");
  }
}

function verifyHeldOutAllowed(manifest, freezeText, expectedHash) {
  if (!/^FREEZE_FLAG: SET\s*$/m.test(freezeText)) fail("held-out evaluation refused: freeze flag is not set in eval/FREEZE.md");
  assertHeldOutContentHash(manifest, expectedHash);
}

/** Test split access remains locked until FREEZE.md is explicitly changed. */
export function assertHeldOutAllowed(manifest) {
  verifyHeldOutAllowed(manifest, readFileSync(paths.freeze, "utf8"), readCommittedHash());
}

/** Test-only injection point for the flag/hash gate; production callers use assertHeldOutAllowed. */
export function __testOnly_heldOutCheck(manifest, freezeText, expectedHash) {
  verifyHeldOutAllowed(manifest, freezeText, expectedHash);
}

/** The only accessor for eval rows; both splits validate hashes and group integrity before returning. */
export function loadSplit(manifest, split) {
  if (split !== "dev" && split !== "test") throw new Error(`manifest: unknown split ${split}`);
  const groundTruth = JSON.parse(readFileSync(paths.groundTruth, "utf8"));
  const expectedHash = readCommittedHash();
  assertManifest(manifest, groundTruth, { sha256: expectedHash });
  if (split === "test") assertHeldOutAllowed(manifest);
  return manifest.records.filter((row) => row.split === split);
}
