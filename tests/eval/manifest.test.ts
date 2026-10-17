// TASK-064: identity-grouped manifest. Every split_group_id sits wholly in dev or test, counts are
// asserted with denominators, the hash is committed, and the held-out set stays locked until freeze.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { assertHeldOutAllowed, assertManifest, buildManifest, serializeManifest } from "../../eval/manifest-lib.mjs";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const gt = JSON.parse(read("data/synthetic/ground_truth.json"));
const manifest = JSON.parse(read("eval/manifest.json"));
const committedHash = read("eval/manifest.sha256").trim().split(/\s+/)[0];
type Row = { record_id: string; split: "dev" | "test"; split_group_id: string; identity_id: string; demo_role: string | null; speaker_id: string | null };
const rows: Row[] = manifest.records;
const clone = () => JSON.parse(JSON.stringify(manifest));

describe("TASK-064 manifest", () => {
  it("has one row per record with the spec fields and a null speaker_id", () => {
    expect(rows).toHaveLength(200);
    for (const k of ["record_id", "kind", "identity_id", "duplicate_group_id", "true_partner_ids", "no_match", "decoy_type", "source_variant", "split", "speaker_id", "ground_truth_revision"]) {
      expect(Object.keys(manifest.records[0])).toContain(k);
    }
    expect(rows.every((r) => r.speaker_id === null)).toBe(true);
    expect(new Set(rows.map((r) => r.record_id)).size).toBe(200);
  });

  it("keeps every split_group_id and identity wholly in one split", () => {
    for (const key of ["split_group_id", "identity_id"] as const) {
      const seen = new Map<string, Set<string>>();
      for (const r of rows) (seen.get(r[key]) ?? seen.set(r[key], new Set()).get(r[key])!).add(r.split);
      for (const [, s] of seen) expect(s.size).toBe(1);
    }
  });

  it("asserts the A-039 counts and reports actual grouped dev/test counts", () => {
    const c = manifest.counts;
    expect(c.total).toBe(200);
    expect(c.missing_canonical).toBe(80);
    expect(c.found_canonical).toBe(80);
    expect(c.decoys).toBe(40);
    expect(c.true_pairs).toBe(60);
    expect(c.no_match_queries).toBe(20);
    expect(c.duplicate_links).toBe(25);
    expect(c.records.dev + c.records.test).toBe(200);
    expect(c.true_pairs_by_split.dev + c.true_pairs_by_split.test).toBe(60);
    expect(c.no_match_identities_by_split.dev + c.no_match_identities_by_split.test).toBe(15);
    expect(c.duplicate_groups_by_split.dev + c.duplicate_groups_by_split.test).toBe(25);
    expect(rows.filter((r) => r.split === "dev")).toHaveLength(c.records.dev);
    // intent is 40/60; the grouped result is reported, not forced
    console.log("actual grouped counts", JSON.stringify(c));
    expect(Math.abs(c.records.dev - 80)).toBeLessThanOrEqual(4);
  });

  it("puts every demo-role group in dev", () => {
    const demo = rows.filter((r) => r.demo_role);
    expect(demo.length).toBeGreaterThanOrEqual(6);
    expect(new Set(demo.map((r) => r.demo_role))).toEqual(new Set(["rafi", "kamalapur_boy", "narayanganj_decoy", "mim", "mim_public_post", "sabbir"]));
    expect(demo.every((r) => r.split === "dev")).toBe(true);
    const demoGroups = new Set(demo.map((r) => r.split_group_id));
    expect(rows.filter((r) => demoGroups.has(r.split_group_id)).every((r) => r.split === "dev")).toBe(true);
  });

  it("matches the committed hash and passes assertManifest", () => {
    const text = read("eval/manifest.json");
    expect(createHash("sha256").update(text).digest("hex")).toBe(committedHash);
    expect(() => assertManifest(manifest, gt, { sha256: committedHash })).not.toThrow();
  });

  it("regenerates byte-identically from the ground truth", () => {
    expect(serializeManifest(buildManifest(gt))).toBe(read("eval/manifest.json"));
  });

  it("rejects a doctored manifest: group split across dev/test, wrong count, wrong hash", () => {
    const split = clone();
    const grp = split.records.find((r: Row) => r.split_group_id !== "SG-001" && split.records.filter((x: Row) => x.split_group_id === r.split_group_id).length > 1).split_group_id;
    const first = split.records.find((r: Row) => r.split_group_id === grp);
    first.split = first.split === "dev" ? "test" : "dev";
    expect(() => assertManifest(split, gt)).toThrow(/split_group_id/);

    const short = clone();
    short.records.pop();
    expect(() => assertManifest(short, gt)).toThrow(/200|count/);

    const wrongCount = clone();
    wrongCount.records.find((r: { kind: string; no_match: boolean }) => r.kind === "missing" && r.no_match).no_match = false;
    expect(() => assertManifest(wrongCount, gt)).toThrow();

    expect(() => assertManifest(manifest, gt, { sha256: "0".repeat(64) })).toThrow(/hash/);
  });

  it("locks the held-out test split until the freeze flag is set", () => {
    expect(() => assertHeldOutAllowed(manifest)).toThrow(/freeze/i);
    expect(() => assertHeldOutAllowed(manifest, { freezeText: "FREEZE_FLAG: SET\n" })).not.toThrow();
    expect(() => assertHeldOutAllowed(manifest, { freezeText: "FREEZE_FLAG: NOT SET\n" })).toThrow(/freeze/i);
    expect(() => assertHeldOutAllowed(manifest, { freezeText: "FREEZE_FLAG: SET\n", sha256: "0".repeat(64) })).toThrow(/hash/);
  });

  it("FREEZE.md says NOT FROZEN and leaves model/prefix values UNKNOWN", () => {
    const f = read("eval/FREEZE.md");
    expect(f).toMatch(/^FREEZE_FLAG: NOT SET$/m);
    expect(f).toMatch(/NOT FROZEN/);
    expect(f).toMatch(/UNKNOWN/);
  });
});
