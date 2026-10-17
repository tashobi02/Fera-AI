// TASK-064 / TC-064 / FV-11: identity-grouped manifest and frozen dev/held-out split.
//
// Reads the committed synthetic set (data/synthetic/ground_truth.json and
// records.jsonl), rebuilds the connected-component groups (identity, duplicate,
// partner and decoy-target links — same rules as db/seed/synthetic.mjs uses to
// stamp split_group_id) and assigns each whole group to "dev" or "heldout"
// under a fixed seed at ~70/30 by group. A group never spans both splits. The
// manifest records per-split counts of the categories D2 Part B §17 names
// (true pairs, no-match queries, duplicate links, shared-phone decoys, decoys)
// and the SHA-256 of every input plus of the manifest itself.
//
// `node eval/manifest.mjs` writes data/synthetic/manifest.json and
// data/synthetic/manifest.sha256.
// `node eval/manifest.mjs --check` exits 1 if the committed manifest or its
// hash do not match a fresh build.
//
// AMD-3-3 (held-out integrity): no threshold, model or prompt may be tuned on
// held-out results. The manifest here is the only thing that decides which
// record belongs to which split; downstream eval:match / eval:dedupe / eval:all
// read it.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SYNTH_DIR = join(ROOT, "data", "synthetic");
const MANIFEST_PATH = join(SYNTH_DIR, "manifest.json");
const HASH_PATH = join(SYNTH_DIR, "manifest.sha256");

export const MANIFEST_REVISION = "manifest-1";
export const MANIFEST_SEED = 2020;
// TC-064 target: dev gets the larger share, held-out is the freeze set.
export const DEV_FRACTION = 0.7;

/* ---------- deterministic helpers ---------- */

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/* ---------- grouping: connected components over true pairs, duplicate links, decoy targets ---------- */

function buildGroups(records) {
  // Union-find keyed by record_id. identity_id, duplicate_group_id, true_partner_ids
  // and decoy_target_ids all merge nodes into one connected group, matching the
  // split_group_id that db/seed/synthetic.mjs computes on the way out.
  const parent = new Map(records.map((r) => [r.record_id, r.record_id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const byIdentity = new Map();
  const byDuplicate = new Map();
  for (const r of records) {
    if (byIdentity.has(r.identity_id)) union(r.record_id, byIdentity.get(r.identity_id));
    else byIdentity.set(r.identity_id, r.record_id);
    if (r.duplicate_group_id) {
      if (byDuplicate.has(r.duplicate_group_id)) union(r.record_id, byDuplicate.get(r.duplicate_group_id));
      else byDuplicate.set(r.duplicate_group_id, r.record_id);
    }
    for (const p of r.true_partner_ids) union(r.record_id, p);
    for (const t of r.decoy_target_ids) union(r.record_id, t);
  }
  const groupOf = new Map();
  let n = 0;
  for (const r of records) {
    const root = find(r.record_id);
    if (!groupOf.has(root)) groupOf.set(root, `MG-${String(++n).padStart(3, "0")}`);
  }
  const out = new Map();
  for (const r of records) {
    const gid = groupOf.get(find(r.record_id));
    if (!out.has(gid)) out.set(gid, []);
    out.get(gid).push(r.record_id);
  }
  return out;
}

/* ---------- per-category counting (D2B §17; categories the brief asks for) ---------- */

function countByCategory(records, ids) {
  const set = new Set(ids);
  const subset = records.filter((r) => set.has(r.record_id));
  // true pairs: number of pair identities in this split (one pair == one identity with both a
  // pair_query and a pair_found in the split). The brief matches the spec's "60 canonical
  // true pairs" — so we count identities, not records.
  const truePairIdentities = new Set();
  let noMatch = 0;
  const dupGroups = new Set();
  let sharedPhone = 0;
  let decoys = 0;
  for (const r of subset) {
    if (r.role === "pair_query" || r.role === "pair_found") truePairIdentities.add(r.identity_id);
    if (r.kind === "missing" && r.no_match) noMatch++;
    if (r.duplicate_group_id) dupGroups.add(r.duplicate_group_id);
    if (r.decoy_type === "shared_phone") sharedPhone++;
    if (r.decoy_type !== null) decoys++;
  }
  return {
    true_pairs: truePairIdentities.size,
    no_match_queries: noMatch,
    duplicate_links: dupGroups.size,
    shared_phone_decoys: sharedPhone,
    decoys,
  };
}

/* ---------- split: ~70/30 by group, fixed seed, stable order ---------- */

function assignSplits(groups) {
  // Stable order: sort groups by their lowest record_id so the seed shuffle is
  // reproducible regardless of insertion order in the union-find.
  const sorted = [...groups.entries()].sort((a, b) => {
    const amin = a[1].reduce((m, x) => (x < m ? x : m), a[1][0]);
    const bmin = b[1].reduce((m, x) => (x < m ? x : m), b[1][0]);
    return amin < bmin ? -1 : amin > bmin ? 1 : 0;
  });
  const rng = mulberry32(MANIFEST_SEED);
  // Fisher–Yates with the seeded RNG: same seed ⇒ same shuffle order.
  const arr = [...sorted];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const devCount = Math.round(arr.length * DEV_FRACTION);
  const dev = new Map();
  const heldout = new Map();
  for (let i = 0; i < arr.length; i++) {
    const [gid, members] = arr[i];
    if (i < devCount) dev.set(gid, members);
    else heldout.set(gid, members);
  }
  return { dev, heldout };
}

/* ---------- pure builder ---------- */

// `buildManifest` takes the parsed ground truth plus the raw bytes of the two
// input files. Hashing the raw bytes (not the re-stringified object) is what
// the test pins against and what --check compares.
export function buildManifest(groundTruth, { recordsJsonl, groundTruthBytes, recordsBytes }) {
  const records = groundTruth.records;
  if (records.length !== 200) throw new Error(`buildManifest: expected 200 records, got ${records.length}`);
  // We accept recordsJsonl as a convenience: when called from the CLI the caller
  // has already read the bytes. The unused parameter keeps the function
  // self-contained for tests that pass only the parsed object plus the bytes.
  void recordsJsonl;
  const groups = buildGroups(records);
  const { dev, heldout } = assignSplits(groups);
  const devIds = [...dev.values()].flat();
  const heldIds = [...heldout.values()].flat();
  const countsBySplit = {
    dev: { groups: dev.size, records: devIds.length, ...countByCategory(records, devIds) },
    heldout: { groups: heldout.size, records: heldIds.length, ...countByCategory(records, heldIds) },
  };
  const manifest = {
    manifest_revision: MANIFEST_REVISION,
    ground_truth_revision: groundTruth.ground_truth_revision,
    generator_revision: groundTruth.generator_revision,
    seed: MANIFEST_SEED,
    synthetic: true,
    split: { dev: "calibration and dev eval", heldout: "freeze and held-out eval" },
    dev_fraction: DEV_FRACTION,
    inputs: {
      ground_truth_sha256: sha256(groundTruthBytes),
      records_sha256: sha256(recordsBytes),
    },
    counts: {
      total: records.length,
      groups: groups.size,
      by_split: countsBySplit,
    },
    splits: {
      dev: { group_ids: [...dev.keys()].sort(), record_ids: [...devIds].sort() },
      heldout: { group_ids: [...heldout.keys()].sort(), record_ids: [...heldIds].sort() },
    },
  };
  return manifest;
}

/* ---------- file helpers (CLI) ---------- */

function readInputs() {
  const groundTruthBytes = readFileSync(join(SYNTH_DIR, "ground_truth.json"));
  const recordsBytes = readFileSync(join(SYNTH_DIR, "records.jsonl"));
  const groundTruth = JSON.parse(groundTruthBytes.toString("utf8"));
  const recordsJsonl = recordsBytes.toString("utf8");
  return { groundTruth, recordsJsonl, groundTruthBytes, recordsBytes };
}

function renderManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function writeOutputs(manifest) {
  const body = renderManifest(manifest);
  const hash = sha256(body);
  mkdirSync(SYNTH_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, body);
  writeFileSync(HASH_PATH, `${hash}  manifest.json\n`);
  return { body, hash };
}

// Pure check: returns null when committed matches a fresh build, or a string
// describing the first difference. Tests exercise this so a tampered manifest
// is caught without a subprocess. The CLI uses it to choose its exit code.
export function checkManifest({ groundTruth, groundTruthBytes, recordsBytes }, committedBody, committedHash) {
  if (committedBody === undefined || committedHash === undefined) return "committed manifest or hash is missing";
  const fresh = buildManifest(groundTruth, { recordsJsonl: "", groundTruthBytes, recordsBytes });
  const freshBody = renderManifest(fresh);
  const freshHash = sha256(freshBody);
  if (committedHash !== freshHash) return `hash drift (committed ${committedHash}, fresh ${freshHash})`;
  if (committedBody !== freshBody) return "body drift (hash matches but bytes differ)";
  return null;
}

function checkOutputs() {
  if (!existsSync(MANIFEST_PATH) || !existsSync(HASH_PATH)) {
    console.error("manifest --check: data/synthetic/manifest.json or manifest.sha256 is missing");
    process.exit(1);
  }
  const inputs = readInputs();
  const committedBody = readFileSync(MANIFEST_PATH, "utf8");
  const committedHash = readFileSync(HASH_PATH, "utf8").split(/\s+/)[0];
  const diff = checkManifest(inputs, committedBody, committedHash);
  if (diff) { console.error(`manifest --check: ${diff}`); process.exit(1); }
  console.log("manifest --check: committed manifest matches the builder");
}

function main(argv) {
  const known = new Set(["--check"]);
  for (const a of argv) {
    if (a === "--") continue;
    if (!known.has(a)) { console.error(`manifest: unknown argument ${a}`); process.exit(1); }
  }
  if (argv.includes("--check")) { checkOutputs(); return; }
  const { groundTruth, recordsJsonl, groundTruthBytes, recordsBytes } = readInputs();
  const manifest = buildManifest(groundTruth, { recordsJsonl, groundTruthBytes, recordsBytes });
  const { hash } = writeOutputs(manifest);
  console.log(`wrote data/synthetic/manifest.json (sha256 ${hash}, groups ${manifest.counts.groups}, dev ${manifest.counts.by_split.dev.records} / heldout ${manifest.counts.by_split.heldout.records})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
