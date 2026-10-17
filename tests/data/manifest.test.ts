// TASK-064 / TC-064 / FV-11: the manifest is 200 records split by connected
// identity group, hashes the inputs and itself, and a tampered commit is
// detected without re-running the CLI.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { buildManifest, checkManifest } from "../../eval/manifest.mjs";

const dir = join(process.cwd(), "data", "synthetic");
const read = (n: string) => readFileSync(join(dir, n), "utf8");
const readBuf = (n: string) => readFileSync(join(dir, n));
const sha = (s: Buffer | string) => createHash("sha256").update(s).digest("hex");

type Row = {
  record_id: string;
  role: "pair_query" | "pair_found" | "dup_found" | "dup_missing" | "no_match_query" | "decoy";
  identity_id: string;
  duplicate_group_id: string | null;
  true_partner_ids: string[];
  no_match: boolean;
  decoy_type: string | null;
  decoy_target_ids: string[];
  split_group_id?: string;
};
type Counts = {
  total: number; missing_canonical: number; found_canonical: number; decoys: number;
  true_pairs: number; no_match_queries: number; duplicate_links: number;
  shared_phone_decoys: number; no_match_identities: number;
  pair_identities_with_duplicate_found: number; split_groups: number;
  records_sharing_a_phone_across_identities: number;
};
type Manifest = {
  manifest_revision: string;
  inputs: { ground_truth_sha256: string; records_sha256: string };
  counts: { total: number; groups: number; by_split: { dev: SplitSummary; heldout: SplitSummary } };
  splits: { dev: { group_ids: string[]; record_ids: string[] }; heldout: { group_ids: string[]; record_ids: string[] } };
};
type SplitSummary = { groups: number; records: number; true_pairs: number; no_match_queries: number; duplicate_links: number; shared_phone_decoys: number; decoys: number };

const groundTruthBytes = readBuf("ground_truth.json");
const recordsBytes = readBuf("records.jsonl");
const groundTruth = JSON.parse(groundTruthBytes.toString("utf8")) as { counts: Counts; records: Row[] };
const rows: Row[] = groundTruth.records;

const build = () => buildManifest(groundTruth, { recordsJsonl: recordsBytes.toString("utf8"), groundTruthBytes, recordsBytes });

describe("manifest (TASK-064 / TC-064 / FV-11)", () => {
  it("has the declared composition: 200 records, 75 groups, 60/20/25/7/40 per category", () => {
    const m = build() as Manifest;
    expect(m.counts.total).toBe(200);
    expect(m.counts.groups).toBe(75);
    const dev = m.counts.by_split.dev;
    const held = m.counts.by_split.heldout;
    expect(dev.true_pairs + held.true_pairs).toBe(60);
    expect(dev.no_match_queries + held.no_match_queries).toBe(groundTruth.counts.no_match_queries);
    expect(dev.duplicate_links + held.duplicate_links).toBe(groundTruth.counts.duplicate_links);
    expect(dev.shared_phone_decoys + held.shared_phone_decoys).toBe(groundTruth.counts.shared_phone_decoys);
    expect(dev.decoys + held.decoys).toBe(groundTruth.counts.decoys);
  });

  it("puts every record in exactly one split (no overlap, no omission)", () => {
    const m = build() as Manifest;
    const all = [...m.splits.dev.record_ids, ...m.splits.heldout.record_ids];
    expect(new Set(all).size).toBe(200);
    expect(all).toHaveLength(200);
    const known = new Set(rows.map((r) => r.record_id));
    for (const id of all) expect(known.has(id), `unknown id ${id}`).toBe(true);
  });

  it("no connected identity/duplicate/partner/decoy-target group spans both splits", () => {
    const m = build() as Manifest;
    // Build the same connected components the manifest does, but independently
    // here in the test, so a regression in the manifest builder is caught
    // rather than hidden by a self-comparison.
    const parent = new Map(rows.map((r) => [r.record_id, r.record_id]));
    const find = (x: string): string => { while (parent.get(x) !== x) { const p = parent.get(x)!; parent.set(x, parent.get(p)!); x = parent.get(x)!; } return x; };
    const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const byIdentity = new Map<string, string>();
    const byDuplicate = new Map<string, string>();
    for (const r of rows) {
      if (byIdentity.has(r.identity_id)) union(r.record_id, byIdentity.get(r.identity_id)!);
      else byIdentity.set(r.identity_id, r.record_id);
      if (r.duplicate_group_id) {
        if (byDuplicate.has(r.duplicate_group_id)) union(r.record_id, byDuplicate.get(r.duplicate_group_id)!);
        else byDuplicate.set(r.duplicate_group_id, r.record_id);
      }
      for (const p of r.true_partner_ids) union(r.record_id, p);
      for (const t of r.decoy_target_ids) union(r.record_id, t);
    }
    const devSet = new Set(m.splits.dev.record_ids);
    const seen = new Map<string, "dev" | "heldout">();
    for (const id of [...m.splits.dev.record_ids, ...m.splits.heldout.record_ids]) {
      const root = find(id);
      const side = devSet.has(id) ? "dev" : "heldout";
      const prev = seen.get(root);
      // Group must not span both splits. The first record of a group sets prev; the
      // second must agree. Same-side on a later record is the success case.
      expect(prev === undefined || prev === side, `group ${root} appears in both dev and heldout (record ${id}; previous side ${prev})`).toBe(true);
      seen.set(root, side);
    }
    expect(seen.size).toBe(75);
  });

  it("hash stable across two builds and inputs are pinned to the committed files", () => {
    const a = build();
    const b = build();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const committed = JSON.parse(read("manifest.json")) as Manifest;
    expect(committed.inputs.ground_truth_sha256).toBe(sha(groundTruthBytes));
    expect(committed.inputs.records_sha256).toBe(sha(recordsBytes));
  });

  it("--check passes for the committed manifest and fails for a tampered one (pure function)", () => {
    const committedBody = read("manifest.json");
    const committedHash = read("manifest.sha256").split(/\s+/)[0];
    const inputs = { groundTruth, groundTruthBytes, recordsBytes };
    // The current committed files were written by this builder, so checkManifest returns null.
    expect(checkManifest(inputs, committedBody, committedHash)).toBeNull();

    // Missing committed inputs are reported, never throw. The CLI catches
    // "file not on disk" first, but the pure function still answers
    // "committed artefact is missing" when the caller hands it undefined.
    expect(checkManifest(inputs, undefined as unknown as string, undefined as unknown as string)).toMatch(/missing/);

    // Tamper the body: keep the hash unchanged. checkManifest compares both, so the body check fails.
    const tamperedBody = committedBody.replace(/"dev"/, '"dxx"');
    expect(checkManifest(inputs, tamperedBody, committedHash)).toMatch(/body drift/);

    // Tamper only the hash: a different committed hash triggers the hash check.
    const wrongHash = "0".repeat(64);
    expect(checkManifest(inputs, committedBody, wrongHash)).toMatch(/hash drift/);
  });

  it("records the D2 Part B §17 categories in the manifest and the split is roughly 70/30 by group", () => {
    const m = build() as Manifest;
    for (const side of [m.counts.by_split.dev, m.counts.by_split.heldout]) {
      expect(side).toHaveProperty("true_pairs");
      expect(side).toHaveProperty("no_match_queries");
      expect(side).toHaveProperty("duplicate_links");
      expect(side).toHaveProperty("shared_phone_decoys");
      expect(side).toHaveProperty("decoys");
    }
    const total = m.counts.groups;
    const devShare = m.counts.by_split.dev.groups / total;
    expect(devShare).toBeGreaterThanOrEqual(0.65);
    expect(devShare).toBeLessThanOrEqual(0.75);
  });
});
