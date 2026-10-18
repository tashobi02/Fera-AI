// TASK-064: manifest integrity and test split freeze guard.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { __testOnly_heldOutCheck, assertHeldOutAllowed, loadSplit } from "../../eval/manifest-lib.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const manifest = JSON.parse(read("eval/manifest.json"));
const committedHash = read("eval/manifest.sha256").trim().split(/\s+/)[0];

describe("held-out manifest guard (TASK-064)", () => {
  it("leaves the test split locked while FREEZE_FLAG is NOT SET", () => {
    expect(read("eval/FREEZE.md")).toMatch(/^FREEZE_FLAG: NOT SET$/m);
    expect(() => assertHeldOutAllowed(manifest)).toThrow(/freeze flag is not set/i);
    expect(() => loadSplit(manifest, "test")).toThrow(/freeze flag is not set/i);
  });

  it("requires an explicit freeze flag and the exact committed manifest hash", () => {
    expect(() => __testOnly_heldOutCheck(manifest, "FREEZE_FLAG: SET\n", committedHash)).not.toThrow();
    expect(() => __testOnly_heldOutCheck(manifest, "FREEZE_FLAG: NOT SET\n", committedHash)).toThrow(/freeze flag/i);
    expect(() => __testOnly_heldOutCheck(manifest, "FREEZE_FLAG: SET\n", "0".repeat(64))).toThrow(/hash differs/i);
  });

  it("validates hashes and group integrity for dev loads too", () => {
    const tampered = structuredClone(manifest);
    tampered.records[0].split = tampered.records[0].split === "dev" ? "test" : "dev";
    expect(() => loadSplit(tampered, "dev")).toThrow(/hash differs|seeded split differs|spans dev and test/i);
  });
});
