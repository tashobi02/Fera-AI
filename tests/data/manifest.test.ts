// TASK-064 / TC-064 / FV-11: preserve the committed identity-grouped split and source hashes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { assertManifest, buildManifest, loadSplit, serializeManifest } from "../../eval/manifest.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readBuf = (path: string) => readFileSync(join(root, path));
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const groundTruthBytes = readBuf("data/synthetic/ground_truth.json");
const recordsBytes = readBuf("data/synthetic/records.jsonl");
const groundTruth = JSON.parse(groundTruthBytes.toString("utf8"));
const manifest = JSON.parse(read("eval/manifest.json"));
const committedHash = read("eval/manifest.sha256").trim().split(/\s+/)[0];
const build = () => buildManifest(groundTruth, { groundTruthBytes, recordsBytes });

describe("manifest (TASK-064 / TC-064 / FV-11)", () => {
  it("keeps the existing seed-2020 identity-grouped dev/test membership", () => {
    const built = build();
    expect(built.seed).toBe(2020);
    expect(built.counts).toMatchObject({ total: 200, groups: 75 });
    expect(built.counts.by_split.dev).toMatchObject({ groups: 30, records: 86 });
    expect(built.counts.by_split.test).toMatchObject({ groups: 45, records: 114 });
    const devDigest = sha(built.records.filter((row: { split: string }) => row.split === "dev").map((row: { record_id: string }) => row.record_id).join("\n"));
    const testDigest = sha(built.records.filter((row: { split: string }) => row.split === "test").map((row: { record_id: string }) => row.record_id).join("\n"));
    expect(devDigest).toBe("052c5917994e37919620c1658cc92bec4ef3088d11c704d542a0ffbb93373b3f");
    expect(testDigest).toBe("4659b089b1efc2606ef0f06e2b1faca7edbdd38bf237c6171fb9f0cdd58d0576");
  });

  it("declares the expected synthetic composition and per-split denominators", () => {
    expect(manifest.counts).toMatchObject({
      total: 200, groups: 75, missing_canonical: 80, found_canonical: 80, decoys: 40,
      true_pairs: 60, no_match_queries: 20, duplicate_links: 25, shared_phone_decoys: 7,
    });
    expect(manifest.counts.by_split.dev.true_pairs + manifest.counts.by_split.test.true_pairs).toBe(60);
    expect(manifest.counts.by_split.dev.no_match_queries + manifest.counts.by_split.test.no_match_queries).toBe(20);
    expect(manifest.counts.by_split.dev.duplicate_links + manifest.counts.by_split.test.duplicate_links).toBe(25);
  });

  it("includes every ground-truth record exactly once with a null speaker id", () => {
    expect(manifest.records).toHaveLength(200);
    expect(new Set(manifest.records.map((row: { record_id: string }) => row.record_id)).size).toBe(200);
    expect(manifest.records.every((row: { speaker_id: string | null }) => row.speaker_id === null)).toBe(true);
    expect(manifest.records.map((row: { record_id: string }) => row.record_id).sort()).toEqual(groundTruth.records.map((row: { record_id: string }) => row.record_id).sort());
  });

  it("pins the source and manifest hashes, and regenerates byte-identically", () => {
    const text = read("eval/manifest.json");
    expect(createHash("sha256").update(text).digest("hex")).toBe(committedHash);
    expect(manifest.inputs.ground_truth_sha256).toBe(sha(groundTruthBytes));
    expect(manifest.inputs.records_sha256).toBe(sha(recordsBytes));
    expect(serializeManifest(build())).toBe(text);
    expect(() => assertManifest(manifest, groundTruth, { sha256: committedHash, groundTruthBytes, recordsBytes })).not.toThrow();
  });

  it("rejects a split group crossing the boundary and returns only validated dev rows", () => {
    const corrupted = structuredClone(manifest);
    const first = corrupted.records.find((row: { split_group_id: string }) => corrupted.records.filter((other: { split_group_id: string }) => other.split_group_id === row.split_group_id).length > 1);
    const second = corrupted.records.find((row: { split_group_id: string; record_id: string }) => row.split_group_id === first.split_group_id && row.record_id !== first.record_id);
    second.split = second.split === "dev" ? "test" : "dev";
    expect(() => assertManifest(corrupted, groundTruth, { sha256: sha(serializeManifest(corrupted)) })).toThrow(/seeded split differs|split_group_id .* spans/i);
    const dev = loadSplit(manifest, "dev");
    expect(dev).toHaveLength(86);
    expect(dev.every((row: { split: string }) => row.split === "dev")).toBe(true);
    expect(() => loadSplit(manifest, "other")).toThrow(/unknown split/);
  });
});
