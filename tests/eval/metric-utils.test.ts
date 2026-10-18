// Canonical split integration tests for the shared eval CLI helpers.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { loadSplit as loadCanonicalSplit } from "../../eval/manifest-lib.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { checkFreezeGate, FREEZE_PATH, loadManifest, loadSplitRecords, MANIFEST_HASH_PATH, MANIFEST_PATH, REPORTS_DIR, splitInfoFromManifest } from "../../eval/metric-utils.mjs";

describe("eval/metric-utils canonical manifest integration", () => {
  it("uses the canonical eval paths", () => {
    expect(MANIFEST_PATH).toBe(resolve(process.cwd(), "eval/manifest.json"));
    expect(MANIFEST_HASH_PATH).toBe(resolve(process.cwd(), "eval/manifest.sha256"));
    expect(FREEZE_PATH).toBe(resolve(process.cwd(), "eval/FREEZE.md"));
    expect(REPORTS_DIR).toBe(resolve(process.cwd(), "eval/reports"));
  });

  it("returns the canonical dev and test IDs and groups without changing assignment", () => {
    const manifest = loadManifest();
    expect(manifest).not.toBeNull();
    const canonicalDev = loadCanonicalSplit(manifest, "dev");
    const dev = loadSplitRecords("dev");

    expect([...dev.recordIds].sort()).toEqual(canonicalDev.map((row: { record_id: string }) => row.record_id).sort());
    expect([...dev.groupIds].sort()).toEqual([...new Set(canonicalDev.map((row: { split_group_id: string }) => row.split_group_id))].sort());
    expect(dev.split).toBe("dev");
    expect(dev.counts).toEqual(manifest.counts.by_split.dev);
    expect(dev.recordIds.size).toBe(86);
    expect(dev.groupIds.size).toBe(30);

    const canonicalTestInfo = splitInfoFromManifest(manifest, "test");
    const heldoutAlias = splitInfoFromManifest(manifest, "heldout");
    expect(canonicalTestInfo?.record_ids).toEqual(heldoutAlias?.record_ids);
    expect(canonicalTestInfo?.group_ids).toEqual(heldoutAlias?.group_ids);
    expect(canonicalTestInfo?.record_ids).toHaveLength(114);
    expect(canonicalTestInfo?.group_ids).toHaveLength(45);
  });

  it("leaves test locked by FREEZE.md regardless of legacy environment values", () => {
    const names = ["FERA_FREEZE_COMMIT", "FERA_FREEZE_MODEL", "FERA_MANIFEST_SHA256"] as const;
    const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      process.env.FERA_FREEZE_COMMIT = "matching-looking-commit";
      process.env.FERA_FREEZE_MODEL = "model@revision";
      process.env.FERA_MANIFEST_SHA256 = readFileSync(MANIFEST_HASH_PATH, "utf8").trim().split(/\s+/)[0];

      const result = checkFreezeGate("test");
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/freeze flag is not set in eval\/FREEZE\.md/i);
      expect(() => loadSplitRecords("heldout")).toThrow(/freeze flag is not set/i);
    } finally {
      for (const name of names) {
        const value = before[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("rejects a tampered canonical manifest instead of treating it as unmeasured", () => {
    const manifest = loadManifest();
    expect(manifest).not.toBeNull();
    const tampered = structuredClone(manifest);
    tampered.records[0].split = tampered.records[0].split === "dev" ? "test" : "dev";

    expect(() => loadCanonicalSplit(tampered, "dev")).toThrow(/hash differs|seeded split differs|spans dev and test/i);
    expect(() => loadCanonicalSplit(tampered, "test")).toThrow(/hash differs|seeded split differs|spans dev and test/i);
  });
});
